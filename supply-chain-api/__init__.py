"""
Supply Chain API Package
Organized imports for better modularity
"""

# Standard library imports
import math
import os
import re
import time
from datetime import datetime
from typing import Optional, Union

# Third-party imports
import joblib
import json
import networkx as nx
import numpy as np
import torch
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from torch.nn import Linear, Sequential, ReLU, Dropout, BatchNorm1d, LayerNorm
from torch_geometric.nn import SAGEConv
from itertools import islice, product
import google.generativeai as genai
from dotenv import load_dotenv

# Local imports
from risk_engine import assess_route_risk

# ============================================================
# PYDANTIC MODELS
# ============================================================
class RouteRequest(BaseModel):
    source_city:          str
    target_city:          str
    category_name:        str
    quantity:             float = 1.0
    priority_level:       Optional[Union[str, float]] = "Standard Class"
    dispatch_date:        str
    scheduled_days:       Optional[float] = None
    delivery_type:        Optional[str] = None
    transit_hubs:         Optional[list[str]] = []
    mock_disruption_city: Optional[str] = None
    mock_disruption_type: Optional[str] = None

class RecommendedRoute(BaseModel):
    option:               int
    total_transit_days:   float
    route_risk_level:     float
    route:                list[dict]
    forced_through_hubs:  bool = False
    has_high_risk_hub:    bool = False

class RouteResponse(BaseModel):
    source:               str
    target:               str
    category_name:        str
    quantity:             float
    delivery_type:        Optional[str]
    transit_hubs:         list[str]
    dispatch_date:        str
    priority_level:       str
    recommended_routes:   list[RecommendedRoute]
    node_risks:           dict

class GeminiDecisionOutput(BaseModel):
    recommended_option: int   = Field(description="Option number (1, 2, or 3) that is recommended.")
    executive_summary:  str   = Field(description="2-3 sentence explanation of WHY this route was chosen.")
    trade_offs:         list[str] = Field(description="2-3 bullet points comparing time vs risk trade-offs.")

class DecisionRequest(BaseModel):
    priority_level: str
    routes:         list
    node_risks:     dict

class LiveTrackRequest(BaseModel):
    route_id: str
    cities: list[dict]  # [{"city_name": "Mumbai", "status": "completed", "order": 1}]
    current_city_index: int  # Index of last completed city for re-routing
    delivery_type: str
    category: str
    dispatch_date: str

# ============================================================
# ENVIRONMENT CONFIGURATION
# ============================================================
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_GEMINI_KEY")
PORT = int(os.getenv("PORT", 8080))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",") if os.getenv("ALLOWED_ORIGINS") else ["*"]

# Gemini configuration
genai.configure(api_key=GEMINI_API_KEY)
decision_model = genai.GenerativeModel("gemini-3.1-flash-lite-preview")

# Risk cache
RISK_CACHE = {}
CACHE_TTL_SECONDS = 1800  # 30 minutes

# ============================================================
# FILE CONSTANTS
# ============================================================
INFER_NODES_FILE = "nodes_inference.json"
INFER_EDGES_FILE = "edges_inference.json"
CATEGORY_MAPPING_FILE = "category_mapping.json"
FEATURE_SCHEMA_FILE = "feature_schema.json"

MODEL_FILE = "supply_chain_model.pth"
NODE_SCALER_FILE = "node_scaler.pkl"
EDGE_SCALER_FILE = "edge_scaler.pkl"

# ============================================================
# FEATURE LAYOUT CONSTANTS
# ============================================================
DIST_IDX = 0
CROSS_BORDER_IDX = 1
MONTH_SIN_IDX = 2
MONTH_COS_IDX = 3
DAY_SIN_IDX = 4
DAY_COS_IDX = 5
HOUR_SIN_IDX = 6
HOUR_COS_IDX = 7
SCHEDULED_DAYS_IDX = 8
PREFERENCE_IDX = 9
QUANTITY_IDX = 10
PHYSICAL_MODE_IDX = 11
CATEGORY_START_IDX = 12

# ============================================================
# ENODING MAPPINGS
# ============================================================
PHYSICAL_MODE_TO_IDX = {"Truck": 0.0, "Air": 1.0, "Ocean": 2.0}

PRIORITY_TO_ENCODING = {
    "Standard Class": 0.0, "Second Class": 1.0,
    "First Class": 2.0,    "Same Day": 3.0,
    "Standard": 0.0,       "Second": 1.0,
    "First": 2.0,          "Urgent": 3.0,
}

PRIORITY_TO_SCHEDULED_DAYS = {0.0: 4.0, 1.0: 3.0, 2.0: 2.0, 3.0: 0.0}

# ============================================================
# MODEL DEFINITION
# ============================================================
class RobustSupplyChainSAGE(torch.nn.Module):
    def __init__(self, node_in_dim, edge_in_dim, hidden_dim, num_layers=3, dropout=0.2):
        super().__init__()
        self.node_encoder = Linear(node_in_dim, hidden_dim)
        self.convs  = torch.nn.ModuleList()
        self.norms  = torch.nn.ModuleList()
        for _ in range(num_layers):
            self.convs.append(SAGEConv(hidden_dim, hidden_dim, aggr=["mean", "max"]))
            self.norms.append(LayerNorm(hidden_dim))
        self.dropout = Dropout(dropout)
        concat_dim = (hidden_dim * 2) + edge_in_dim
        self.edge_predictor = Sequential(
            Linear(concat_dim, hidden_dim * 2),
            BatchNorm1d(hidden_dim * 2), ReLU(), self.dropout,
            Linear(hidden_dim * 2, hidden_dim), ReLU(),
            Linear(hidden_dim, 1),
        )

    def forward(self, x, edge_index, edge_attr, query_edge_indices):
        h = self.node_encoder(x)
        for i, conv in enumerate(self.convs):
            h_res = h
            h = conv(h, edge_index)
            h = self.norms[i](h)
            h = ReLU()(h)
            h = self.dropout(h)
            h = h + h_res
        src_idx, tgt_idx = query_edge_indices[0], query_edge_indices[1]
        edge_inputs = torch.cat([h[src_idx], h[tgt_idx], edge_attr], dim=1)
        return self.edge_predictor(edge_inputs)

# ============================================================
# HELPER FUNCTIONS
# ============================================================
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def get_physics_baseline(dist_km, mode):
    if mode == "Air":   return (dist_km / (800 * 24)) + 0.5
    if mode == "Truck": return (dist_km * 1.28) / (70 * 24) + 0.5
    if mode == "Ocean": return (dist_km / (35 * 24)) + 2.0
    return 999.0

def parse_dispatch_datetime(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", ""))
    except Exception:
        return datetime.now()

def encode_priority(priority_level: Union[str, float, int]) -> float:
    if isinstance(priority_level, (int, float)):
        return float(priority_level)
    key = str(priority_level).strip()
    if key in PRIORITY_TO_ENCODING:
        return float(PRIORITY_TO_ENCODING[key])
    try:
        return float(key)
    except Exception:
        return 0.0

def one_hot_category(category_name: str, category_to_idx: dict, num_categories: int):
    vec = [0.0] * num_categories
    idx = category_to_idx.get(category_name)
    if idx is not None:
        vec[idx] = 1.0
    return vec

def infer_scheduled_days(priority_encoded: float, scheduled_days: Optional[float]) -> float:
    if scheduled_days is not None:
        return float(scheduled_days)
    return float(PRIORITY_TO_SCHEDULED_DAYS.get(float(priority_encoded), 4.0))

def normalize_city(city: str) -> str:
    """Consistent casing so cache lookups never miss due to case differences."""
    return city.strip().title()

def gemini_decision_with_retry(prompt: str, generation_config, max_retries: int = 2):
    """Retry helper for the /select_best_route Gemini call."""
    for attempt in range(max_retries + 1):
        try:
            return decision_model.generate_content(prompt, generation_config=generation_config)
        except Exception as e:
            err_str = str(e)
            match = re.search(r'retry_delay\s*\{\s*seconds:\s*(\d+)', err_str)
            wait = int(match.group(1)) + 2 if match else 45
            if attempt < max_retries and ("429" in err_str or "quota" in err_str.lower()):
                print(f"   ⏳ Gemini decision rate-limited. Waiting {wait}s "
                      f"(attempt {attempt + 1}/{max_retries})...")
                time.sleep(wait)
            else:
                raise

def is_edge_allowed(edge_data, delivery_type):
    mode = edge_data["mode"]
    if delivery_type == "Only Air":   return mode == "Air"
    if delivery_type == "Only Ocean": return mode == "Ocean"
    if delivery_type == "Only Truck": return mode == "Truck"
    if delivery_type == "No Air":     return mode != "Air"
    if delivery_type == "No Ocean":   return mode != "Ocean"
    return True

def build_request_edge_features(query: RouteRequest):
    dt = parse_dispatch_datetime(query.dispatch_date)

    month_sin = float(np.sin(2 * np.pi * dt.month    / 12.0))
    month_cos = float(np.cos(2 * np.pi * dt.month    / 12.0))
    day_sin   = float(np.sin(2 * np.pi * dt.weekday()/ 7.0))
    day_cos   = float(np.cos(2 * np.pi * dt.weekday()/ 7.0))
    hour_sin  = float(np.sin(2 * np.pi * dt.hour     / 24.0))
    hour_cos  = float(np.cos(2 * np.pi * dt.hour     / 24.0))

    preference_encoded = encode_priority(query.priority_level)
    scheduled_days     = infer_scheduled_days(preference_encoded, query.scheduled_days)
    category_vec       = one_hot_category(query.category_name, category_to_idx, num_categories)

    modified = []
    for edge in edge_records:
        feat = list(edge["features"])
        feat[DIST_IDX]          = float(feat[DIST_IDX])
        feat[CROSS_BORDER_IDX]  = float(feat[CROSS_BORDER_IDX])
        feat[MONTH_SIN_IDX]     = month_sin
        feat[MONTH_COS_IDX]     = month_cos
        feat[DAY_SIN_IDX]       = day_sin
        feat[DAY_COS_IDX]       = day_cos
        feat[HOUR_SIN_IDX]      = hour_sin
        feat[HOUR_COS_IDX]      = hour_cos
        feat[SCHEDULED_DAYS_IDX] = scheduled_days
        feat[PREFERENCE_IDX]    = float(preference_encoded)
        feat[QUANTITY_IDX]      = float(query.quantity)
        feat[PHYSICAL_MODE_IDX] = float(PHYSICAL_MODE_TO_IDX.get(edge["mode"], 1.0))
        if len(feat) > CATEGORY_START_IDX:
            feat[CATEGORY_START_IDX:] = category_vec
        modified.append(feat)

    return dt, modified

# Export all commonly used items
__all__ = [
    # Environment
    'ENVIRONMENT', 'GEMINI_API_KEY', 'PORT', 'ALLOWED_ORIGINS',
    'decision_model', 'RISK_CACHE', 'CACHE_TTL_SECONDS',
    
    # Files
    'INFER_NODES_FILE', 'INFER_EDGES_FILE', 'CATEGORY_MAPPING_FILE',
    'FEATURE_SCHEMA_FILE', 'MODEL_FILE', 'NODE_SCALER_FILE', 'EDGE_SCALER_FILE',
    
    # Feature constants
    'DIST_IDX', 'CROSS_BORDER_IDX', 'MONTH_SIN_IDX', 'MONTH_COS_IDX',
    'DAY_SIN_IDX', 'DAY_COS_IDX', 'HOUR_SIN_IDX', 'HOUR_COS_IDX',
    'SCHEDULED_DAYS_IDX', 'PREFERENCE_IDX', 'QUANTITY_IDX',
    'PHYSICAL_MODE_IDX', 'CATEGORY_START_IDX',
    
    # Mappings
    'PHYSICAL_MODE_TO_IDX', 'PRIORITY_TO_ENCODING', 'PRIORITY_TO_SCHEDULED_DAYS',
    
    # Model
    'RobustSupplyChainSAGE',
    
    # Pydantic Models
    'RouteResponse', 'GeminiDecisionOutput', 'DecisionRequest', 'LiveTrackRequest',
    
    # Helper functions
    'haversine', 'get_physics_baseline', 'parse_dispatch_datetime',
    'encode_priority', 'one_hot_category', 'infer_scheduled_days',
    'normalize_city', 'gemini_decision_with_retry', 'is_edge_allowed',
    'build_request_edge_features',
    
    # External imports
    'joblib', 'json', 'nx', 'np', 'torch', 'F', 'FastAPI', 'HTTPException',
    'CORSMiddleware', 'BaseModel', 'Field', 'Linear', 'Sequential', 'ReLU',
    'Dropout', 'BatchNorm1d', 'LayerNorm', 'SAGEConv', 'islice', 'product',
    'genai', 'load_dotenv', 'assess_route_risk',
]
