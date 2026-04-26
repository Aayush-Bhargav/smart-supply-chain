# import json
import math
import os
import re
import time
from datetime import datetime
from typing import Optional, Union

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

from risk_engine import assess_route_risk


def calculate_carbon_kg(distance_km: float, mode: str, quantity: float = 1.0) -> float:
    """Calculate CO2 emissions in kg for one leg"""
    factors = {
        "Truck": 0.08,   # 80g / ton-km
        "Air":   0.60,   # 600g / ton-km
        "Ocean": 0.02,   # 20g / ton-km
    }
    factor = factors.get(mode, 0.10)  # default if unknown
    return round(distance_km * quantity * factor, 2)


# Initialize only once (important for Cloud Run / FastAPI)



load_dotenv()




print("🚀 Waking up Supply Chain Route API...")

# ============================================================
# ENVIRONMENT CONFIGURATION
# ============================================================
ENVIRONMENT    = os.getenv("ENVIRONMENT", "development")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_GEMINI_KEY")
PORT           = int(os.getenv("PORT", 8080))
raw_origins    = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

if ENVIRONMENT != "production" and not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = ["http://localhost:3000"]

# ── Single Gemini client for the decision endpoint ──
# risk_engine.py has its OWN genai.configure() + risk_model instance.
# This client is only for /select_best_route.
genai.configure(api_key=GEMINI_API_KEY)
decision_model = genai.GenerativeModel("gemini-3.1-flash-lite-preview")

# ── Global risk cache ──
# { "City Name": {"data": risk_dict, "timestamp": float} }
RISK_CACHE        = {}
CACHE_TTL_SECONDS = 1800  # 30 minutes
RISK_SIGNAL_SOURCES = {
    "weather": "OpenWeatherMap",
    "news": "GNews",
    "analysis": "Gemini 2.5 Flash Lite",
}

# ============================================================
# FILES
# ============================================================
INFER_NODES_FILE     = "nodes_inference.json"
INFER_EDGES_FILE     = "edges_inference.json"
CATEGORY_MAPPING_FILE = "category_mapping.json"
FEATURE_SCHEMA_FILE  = "feature_schema.json"

MODEL_FILE       = "supply_chain_model.pth"
NODE_SCALER_FILE = "node_scaler.pkl"
EDGE_SCALER_FILE = "edge_scaler.pkl"

# ============================================================
# FEATURE LAYOUT  (must match pipeline.py exactly)
# [distance, cross_border, month_sin, month_cos, day_sin, day_cos,
#  hour_sin, hour_cos, scheduled_days, preference, quantity,
#  physical_mode, category_one_hot...]
# ============================================================
DIST_IDX          = 0
CROSS_BORDER_IDX  = 1
MONTH_SIN_IDX     = 2
MONTH_COS_IDX     = 3
DAY_SIN_IDX       = 4
DAY_COS_IDX       = 5
HOUR_SIN_IDX      = 6
HOUR_COS_IDX      = 7
SCHEDULED_DAYS_IDX = 8
PREFERENCE_IDX    = 9
QUANTITY_IDX      = 10
PHYSICAL_MODE_IDX = 11
CATEGORY_START_IDX = 12

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
# HELPERS
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

# ============================================================
# LOAD SCALERS, MAPPING, GRAPH
# ============================================================
try:
    node_scaler = joblib.load(NODE_SCALER_FILE)
    edge_scaler = joblib.load(EDGE_SCALER_FILE)
except Exception as e:
    raise RuntimeError(f"Failed to load scalers: {e}")

if os.path.exists(CATEGORY_MAPPING_FILE):
    with open(CATEGORY_MAPPING_FILE, "r", encoding="utf-8") as f:
        category_to_idx = json.load(f)
else:
    category_to_idx = {}

if os.path.exists(FEATURE_SCHEMA_FILE):
    with open(FEATURE_SCHEMA_FILE, "r", encoding="utf-8") as f:
        feature_schema = json.load(f)
else:
    feature_schema = {}

num_categories = len(category_to_idx)

with open(INFER_NODES_FILE, "r", encoding="utf-8") as f:
    nodes_data = json.load(f)
with open(INFER_EDGES_FILE, "r", encoding="utf-8") as f:
    edges_data = json.load(f)

nodes_data.sort(key=lambda x: x["node_id"])

id_map      = {node["node_id"]: i             for i, node in enumerate(nodes_data)}
rev_id_map  = {i: node["node_id"]             for i, node in enumerate(nodes_data)}
id_to_city  = {node["node_id"]: node["name"]  for node in nodes_data}
city_to_id  = {node["name"]: node["node_id"]  for node in nodes_data}
# ── Global city coordinates for map visualization ──
city_to_coordinates = {
    node["name"]: {
        "lat": float(node["lat"]),
        "lng": float(node["lon"])          # note: "lng" (standard for maps)
    }
    for node in nodes_data
    if "lat" in node and "lon" in node
}
print(f"📍 Loaded coordinates for {len(city_to_coordinates)} cities")

x_raw    = [node["features"] for node in nodes_data]
x_scaled = node_scaler.transform(x_raw)
x_tensor = torch.tensor(x_scaled, dtype=torch.float)

edge_index_list     = []
base_edge_features  = []
edge_records        = []

for edge in edges_data:
    if edge["source"] in id_map and edge["target"] in id_map:
        edge_index_list.append([id_map[edge["source"]], id_map[edge["target"]]])
        base_edge_features.append(edge["features"])
        edge_records.append(edge)

edge_index_tensor = torch.tensor(edge_index_list, dtype=torch.long).t().contiguous()

try:
    edge_attr_scaled = edge_scaler.transform(base_edge_features)
    edge_attr_tensor = torch.tensor(edge_attr_scaled, dtype=torch.float)
    print(f"✅ Using existing scalers. Edge features: {edge_attr_tensor.shape[1]}")
except ValueError as e:
    print(f"⚠️ Scaler mismatch: {e}")
    print("🔄 Regenerating scalers with current data...")
    from sklearn.preprocessing import StandardScaler
    edge_scaler      = StandardScaler()
    edge_attr_scaled = edge_scaler.fit_transform(base_edge_features)
    edge_attr_tensor = torch.tensor(edge_attr_scaled, dtype=torch.float)
    joblib.dump(edge_scaler, EDGE_SCALER_FILE)
    print(f"✅ Updated scalers saved. New edge features: {edge_attr_tensor.shape[1]}")

node_in_dim = x_tensor.shape[1]
edge_in_dim = edge_attr_tensor.shape[1]
ml_model    = RobustSupplyChainSAGE(node_in_dim, edge_in_dim, 128, 4)

try:
    ml_model.load_state_dict(torch.jit.load(MODEL_FILE, map_location="cpu"))
    print(f"✅ Model loaded successfully. Node dim: {node_in_dim}, Edge dim: {edge_in_dim}")
except RuntimeError as e:
    print(f"⚠️ Model architecture mismatch: {e}")

ml_model.eval()

# ============================================================
# BUILD NETWORKX GRAPH
# ============================================================
G = nx.MultiDiGraph()
for node in nodes_data:
    G.add_node(node["node_id"], **node)

edge_order = []
for edge in edge_records:
    src      = edge["source"]
    tgt      = edge["target"]
    mode     = edge["mode"]
    dist_km  = edge.get("distance_km", edge["features"][0])
    base_time = get_physics_baseline(dist_km, mode)
    key = G.add_edge(
        src, tgt,
        source_country=edge["source_country"],
        target_country=edge["target_country"],
        weight=base_time,
        base_time=base_time,
        mode=mode,
        category=edge.get("category"),
        distance_km=dist_km,
    )
    edge_order.append((src, tgt, key))

print("✅ Inference graph loaded.")
print(f"Nodes: {G.number_of_nodes()} | Edges: {G.number_of_edges()}")

# ============================================================
# FASTAPI
# ============================================================
app = FastAPI(title="Supply Chain Route API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ============================================================
# Pydantic Models (add/replace these)
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
    transit_hubs:         Optional[list[str]] = []          # ← already existed
    mock_disruption_city: Optional[str] = None
    mock_disruption_type: Optional[str] = None


class RecommendedRoute(BaseModel):                          # ← NEW helper model
    option:               int
    total_transit_days:   float
    route_risk_level:     float
    route:                list[dict]
    forced_through_hubs:  bool = False          # ← NEW
    has_high_risk_hub:    bool = False          # ← NEW


class RouteResponse(BaseModel):                             # ← NEW (optional but clean)
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
    city_coordinates:     Optional[dict] = None
    baseline_fastest_route: Optional[dict] = None
    baseline_safest_route:  Optional[dict] = None
    risk_checked_at:      Optional[str] = None
    risk_sources:         Optional[dict] = None

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
    mock_disruption_city: str
    mock_disruption_type: str

# ============================================================
# ROUTE BUILDING HELPERS
# ============================================================
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


def is_edge_allowed(edge_data, delivery_type):
    mode = edge_data["mode"]
    if delivery_type == "Only Air":   return mode == "Air"
    if delivery_type == "Only Ocean": return mode == "Ocean"
    if delivery_type == "Only Truck": return mode == "Truck"
    if delivery_type == "No Air":     return mode != "Air"
    if delivery_type == "No Ocean":   return mode != "Ocean"
    if delivery_type == "No Truck":   return mode != "Truck"
    return True


def format_risk_timestamp(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp).isoformat(timespec="seconds")


def enrich_risk_snapshot(risk_data: dict, checked_at_ts: float) -> dict:
    snapshot = dict(risk_data) if isinstance(risk_data, dict) else {}
    snapshot["checked_at"] = format_risk_timestamp(checked_at_ts)
    snapshot["sources"] = dict(RISK_SIGNAL_SOURCES)
    return snapshot


def stamp_node_risks(node_risks: dict, checked_at_ts: float) -> dict:
    return {
        city: enrich_risk_snapshot(risk_data, checked_at_ts)
        for city, risk_data in node_risks.items()
    }


def route_signature(route: dict) -> tuple:
    return tuple(
        (leg.get("from"), leg.get("to"), leg.get("mode"))
        for leg in route.get("route", [])
    )


def attach_matching_option(route: Optional[dict], ranked_routes: list[dict]) -> Optional[dict]:
    if not route:
        return None

    route_with_option = dict(route)
    signature = route_signature(route_with_option)
    matched_route = next(
        (candidate for candidate in ranked_routes if route_signature(candidate) == signature),
        None,
    )
    route_with_option["option"] = matched_route["option"] if matched_route else None
    return route_with_option


def evaluate_route_combo(
    combo,
    G_filtered: nx.MultiDiGraph,
    node_risks: dict,
    quantity: float,
    has_forced_hubs: bool,
    apply_risk_penalty: bool = True,
    enforce_risk_block: bool = True,
) -> Optional[dict]:
    total_time = 0.0
    max_route_risk = 0.0
    route_details = []
    blocked = False
    hub_forced_high_risk = False
    risk_penalty_multiplier = 10.0

    for leg_path in combo:
        if blocked:
            break

        for i in range(len(leg_path) - 1):
            u = leg_path[i]
            v = leg_path[i + 1]

            city_u = normalize_city(id_to_city[u])
            city_v = normalize_city(id_to_city[v])
            risk_u = node_risks.get(city_u, {}).get("risk", 0.0)
            risk_v = node_risks.get(city_v, {}).get("risk", 0.0)

            edge_risk = max(risk_u, risk_v)
            reason_u = node_risks.get(city_u, {}).get("reason", "Normal")
            reason_v = node_risks.get(city_v, {}).get("reason", "Normal")
            edge_reason = reason_u if risk_u >= risk_v else reason_v

            if edge_risk >= 0.8:
                if enforce_risk_block and not has_forced_hubs:
                    blocked = True
                    break
                if has_forced_hubs:
                    hub_forced_high_risk = True

            edge_options = G_filtered[u][v]
            best_key = min(edge_options, key=lambda kk: edge_options[kk]["weight"])
            best_edge = edge_options[best_key]

            leg_base_time = best_edge["weight"]
            if route_details:
                leg_base_time *= 0.7

            leg_time = leg_base_time
            if apply_risk_penalty:
                leg_time += edge_risk * risk_penalty_multiplier

            total_time += leg_time
            max_route_risk = max(max_route_risk, edge_risk)

            if not (route_details and route_details[-1]["to"] == id_to_city[v]):
                distance_km = best_edge.get("distance_km", best_edge.get("distance", 100))
                carbon_kg = calculate_carbon_kg(distance_km, best_edge["mode"], float(quantity))
                route_details.append({
                    "from":        id_to_city[u],
                    "to":          id_to_city[v],
                    "mode":        best_edge["mode"],
                    "days":        round(float(leg_time), 2),
                    "base_time":   round(float(best_edge["base_time"]), 2),
                    "risk_score":  round(edge_risk, 2),
                    "risk_reason": edge_reason,
                    "carbon_kg":   carbon_kg,
                })

    if blocked or not route_details:
        return None

    total_carbon_kg = sum(leg.get("carbon_kg", 0) for leg in route_details)
    return {
        "total_transit_days": round(float(total_time), 2),
        "route_risk_level": round(max_route_risk, 2),
        "total_carbon_kg": round(total_carbon_kg, 2),
        "route": route_details,
        "forced_through_hubs": has_forced_hubs,
        "has_high_risk_hub": hub_forced_high_risk,
    }

# ============================================================
# Function to find top k routes definition
# ============================================================
def find_top_route(
    query: RouteRequest,
    node_risks: dict,
) -> dict:
    """
    Re-routing engine for /live_track.

    Uses the same ML + physics + risk-penalty logic as /find_route but:
      - Returns only the single best route (no Gemini, no top-3)
      - Accepts pre-computed node_risks from the caller (no extra risk calls)
      - No transit hub logic (live re-routes always use an empty hub list)
      - Risk is baked into G_simple edge weights BEFORE path search so
        NetworkX naturally avoids high-risk cities via Dijkstra

    Returns a single route dict in the same shape as one entry in
    /find_route's `recommended_routes` list:
    {
        "option": 1,
        "total_transit_days": float,
        "route_risk_level": float,
        "route": [ {"from", "to", "mode", "days", "base_time",
                    "risk_score", "risk_reason"}, ... ],
        "forced_through_hubs": False,
        "has_high_risk_hub": False,
    }
    Raises HTTPException(404) if no path exists.
    """

    RISK_PENALTY_MULTIPLIER = 10.0

    # ── 1. Validate cities ────────────────────────────────────────────────────
    print(f"🔍 Validating cities: {query.source_city} -> {query.target_city}")
    if query.source_city not in city_to_id:
        raise HTTPException(
            status_code=404,
            detail=f"Re-route source '{query.source_city}' not found in graph."
        )
    if query.target_city not in city_to_id:
        raise HTTPException(
            status_code=404,
            detail=f"Re-route target '{query.target_city}' not found in graph."
        )

    src_id = city_to_id[query.source_city]
    tgt_id = city_to_id[query.target_city]

    # ── 2. Build time-enriched edge features ─────────────────────────────────
    _dt, modified_features = build_request_edge_features(query)
    new_edge_attr = torch.tensor(
        edge_scaler.transform(modified_features), dtype=torch.float
    )

    # ── 3. Run GNN to get per-edge delay predictions ──────────────────────────
    with torch.no_grad():
        predictions = ml_model(
            x_tensor, edge_index_tensor, new_edge_attr, edge_index_tensor
        ).view(-1).cpu().numpy()

    # ── 4. Write GNN delay + physics baseline into graph weights ─────────────
    src_country = nodes_data[id_map[src_id]]["country"]
    tgt_country = nodes_data[id_map[tgt_id]]["country"]

    for idx, (u, v, k) in enumerate(edge_order):
        edge_data  = G[u][v][k]
        delay      = max(0.0, float(predictions[idx]))
        base_time  = edge_data["base_time"]
        final_time = base_time + delay

        # Heavy cross-border penalty when origin and destination are same country
        if edge_data["source_country"] != edge_data["target_country"]:
            if src_country == tgt_country:
                final_time *= 1000

        G[u][v][k]["weight"] = final_time

    # ── 5. Filter graph by delivery_type ─────────────────────────────────────
    G_filtered = nx.MultiDiGraph()
    G_filtered.add_nodes_from(G.nodes(data=True))
    for u, v, k in G.edges(keys=True):
        if is_edge_allowed(G[u][v][k], query.delivery_type):
            G_filtered.add_edge(u, v, key=k, **G[u][v][k])

    # ── 6. Flatten to simple DiGraph + bake risk into weights BEFORE search ───
    # This is the critical step: Dijkstra must see risk-adjusted weights so it
    # naturally routes around high-risk cities rather than being corrected after.
    # risk=0.0 → +0 days | risk=0.4 → +4 days | risk=0.7 → +7 days | risk=1.0 → +10 days
    G_simple = nx.DiGraph()
    for u, v, k, data in G_filtered.edges(keys=True, data=True):
        city_u = normalize_city(id_to_city[u])
        city_v = normalize_city(id_to_city[v])

        risk_u_data = node_risks.get(city_u)
        risk_v_data = node_risks.get(city_v)
        risk_u = risk_u_data.get("risk", 0.0) if isinstance(risk_u_data, dict) else 0.0
        risk_v = risk_v_data.get("risk", 0.0) if isinstance(risk_v_data, dict) else 0.0
        edge_risk = max(risk_u, risk_v)

        # Risk baked in: high-risk edges are genuinely expensive for Dijkstra
        risk_adjusted_weight = data["weight"] + (edge_risk * RISK_PENALTY_MULTIPLIER)

        if G_simple.has_edge(u, v):
            if risk_adjusted_weight < G_simple[u][v]["weight"]:
                G_simple[u][v]["weight"] = risk_adjusted_weight
        else:
            G_simple.add_edge(u, v, weight=risk_adjusted_weight)

    # ── 7. Find candidate paths ───────────────────────────────────────────────
    try:
        paths_gen       = nx.shortest_simple_paths(G_simple, src_id, tgt_id, weight="weight")
        candidate_paths = list(islice(paths_gen, 10))
    except nx.NetworkXNoPath:
        raise HTTPException(
            status_code=404,
            detail=f"No compliant re-route found from "
                   f"'{query.source_city}' to '{query.target_city}'."
        )

    # ── 8. Score candidates ───────────────────────────────────────────────────
    # Risk is already baked into path selection via G_simple weights above.
    # Here we use the raw edge weight (GNN + physics only) for the reported
    # total_transit_days so the user sees actual travel time, not inflated time.
    # The >= 0.8 hard block is a final safety net for catastrophic-risk nodes.
    best_route = None

    for path in candidate_paths:
        total_time     = 0.0
        max_route_risk = 0.0
        route_details  = []
        blocked        = False

        for i in range(len(path) - 1):
            u = path[i]
            v = path[i + 1]

            city_u = normalize_city(id_to_city[u])
            city_v = normalize_city(id_to_city[v])

            risk_u_data = node_risks.get(city_u)
            risk_v_data = node_risks.get(city_v)
            risk_u = risk_u_data.get("risk", 0.0) if isinstance(risk_u_data, dict) else 0.0
            risk_v = risk_v_data.get("risk", 0.0) if isinstance(risk_v_data, dict) else 0.0

            edge_risk   = max(risk_u, risk_v)
            reason_u    = risk_u_data.get("reason", "Normal") if isinstance(risk_u_data, dict) else "Normal"
            reason_v    = risk_v_data.get("reason", "Normal") if isinstance(risk_v_data, dict) else "Normal"
            edge_reason = reason_u if risk_u >= risk_v else reason_v

            # Hard block for catastrophic-risk nodes (safety net)
            if edge_risk >= 0.8:
                blocked = True
                break

            if not G_filtered.has_node(u) or v not in G_filtered[u]:
                blocked = True
                break

            # Use raw weight (GNN + physics) — risk already steered path choice
            edge_options = G_filtered[u][v]
            best_key     = min(edge_options, key=lambda kk: edge_options[kk]["weight"])
            best_edge    = edge_options[best_key]
            leg_time     = best_edge["weight"]   # ← raw, no double-count

            total_time += leg_time
            if edge_risk > max_route_risk:
                max_route_risk = edge_risk

            if not (route_details and route_details[-1]["to"] == id_to_city[v]):
                # Calculate carbon emissions (does NOT affect routing logic)
                distance_km = best_edge.get("distance_km", best_edge.get("distance", 100))
                carbon_kg = calculate_carbon_kg(distance_km, best_edge["mode"], float(query.quantity))
                
                route_details.append({
                    "from":        id_to_city[u],
                    "to":          id_to_city[v],
                    "mode":        best_edge["mode"],
                    "days":        round(float(leg_time), 2),
                    "base_time":   round(float(best_edge["base_time"]), 2),
                    "risk_score":  round(edge_risk, 2),
                    "risk_reason": edge_reason,
                    "carbon_kg":   carbon_kg,  # Only for display, not used in routing
                })

        if not blocked and route_details:
            # Calculate total carbon emissions for the entire route (display only)
            total_carbon_kg = sum(leg.get("carbon_kg", 0) for leg in route_details)
            
            best_route = {
                "option":              1,
                "total_transit_days":  round(float(total_time), 2),
                "route_risk_level":    round(max_route_risk, 2),
                "total_carbon_kg":     round(total_carbon_kg, 2),  # Display only
                "route":               route_details,
                "forced_through_hubs": False,
                "has_high_risk_hub":   False,
            }
            break  # First non-blocked candidate is the Dijkstra-best; stop here

    if best_route is None:
        raise HTTPException(
            status_code=404,
            detail=f"All candidate re-routes from '{query.source_city}' to "
                   f"'{query.target_city}' pass through high-risk cities (risk ≥ 0.8)."
        )

    return best_route

# ============================================================
# ENDPOINTS
# ============================================================
@app.get("/")
def health_check():
    return {
        "status":     "live",
        "nodes":      G.number_of_nodes(),
        "edges":      G.number_of_edges(),
        "categories": num_categories,
    }


@app.post("/find_route")
def find_route(query: RouteRequest):
    # ── 1. Validate cities ──
    if query.source_city not in city_to_id or query.target_city not in city_to_id:
        raise HTTPException(status_code=404, detail="Source or Destination not found.")

    src_id = city_to_id[query.source_city]
    tgt_id = city_to_id[query.target_city]
    hub_ids = [city_to_id[h] for h in (query.transit_hubs or []) if h in city_to_id]
    waypoints = [src_id] + hub_ids + [tgt_id]

    # ── 2. PRE-ROUTE RISK ASSESSMENT (NEW PLACEMENT) ──
    current_time = time.time()
    mock_disruption_city_resolved = None
    node_risks = {}

    if query.mock_disruption_city:
        mock_input = normalize_city(query.mock_disruption_city)
        if mock_input in city_to_id:
            mock_disruption_city_resolved = mock_input
            
            # Fetch fresh risk for the disrupted city immediately
            print(f"🔄 Assessing manual disruption for: {mock_disruption_city_resolved}")
            fresh_risks = assess_route_risk(
                [mock_disruption_city_resolved],
                mock_disruption_city=mock_disruption_city_resolved,
                mock_disruption_type=query.mock_disruption_type,
            )
            node_risks = enrich_risk_snapshot(fresh_risks.get(mock_disruption_city_resolved, {}), current_time)
            # Store back in node_risks for the penalty logic
            node_risks = {mock_disruption_city_resolved: node_risks}

    # ── 3. PASS 1: ML Prediction & Manual Risk Weighting ──
    dt, modified_features = build_request_edge_features(query)
    new_edge_attr = torch.tensor(edge_scaler.transform(modified_features), dtype=torch.float)

    with torch.no_grad():
        predictions = ml_model(
            x_tensor, edge_index_tensor, new_edge_attr, edge_index_tensor
        ).view(-1).cpu().numpy()

    G_local = G.copy()
    for idx, (u, v, k) in enumerate(edge_order):
        edge_data = G_local[u][v][k]
        delay = max(0.0, float(predictions[idx]))
        physics_time = edge_data["base_time"]
        final_time = physics_time + delay

        # --- Target disruption penalty ---
        if mock_disruption_city_resolved:
            u_name = id_to_city[u]
            v_name = id_to_city[v]
            
            # If the edge is incoming to or outgoing from the disrupted city
            if u_name == mock_disruption_city_resolved or v_name == mock_disruption_city_resolved:
                risk_score = node_risks.get(mock_disruption_city_resolved, {}).get("risk", 0.0)
                risk_multiplier = 1.0 + (risk_score * 5.0) # Elevated sensitivity for pre-route pathfinding
                
                if risk_score > 0.4:
                    final_time *= risk_multiplier
                    print(f"⚠️ Penalizing disrupted edge: {u_name} -> {v_name} | New Weight: {final_time:.2f}")

        # --- Country Border Penalty ---
        if edge_data["source_country"] != edge_data["target_country"]:
            src_country = nodes_data[id_map[src_id]]["country"]
            tgt_country = nodes_data[id_map[tgt_id]]["country"]
            if src_country == tgt_country:
                final_time *= 1000  

        G_local[u][v][k]["weight"] = final_time

    # ── 4. FILTER & FLATTEN ──
    G_filtered = nx.MultiDiGraph()
    for u, v, k in G_local.edges(keys=True):
        if is_edge_allowed(G_local[u][v][k], query.delivery_type):
            G_filtered.add_edge(u, v, key=k, **G_local[u][v][k])
    
    G_simple = nx.DiGraph()
    for u, v, k, data in G_filtered.edges(keys=True, data=True):
        w = data["weight"]
        if not G_simple.has_edge(u, v) or w < G_simple[u][v]["weight"]:
            G_simple.add_edge(u, v, weight=w)

    # ── 5. GENERATE PATHS ──
    # Paths found here will now naturally avoid the mock_disruption_city if a better path exists
    try:
        segment_options = []
        for i in range(len(waypoints) - 1):
            paths_gen = nx.shortest_simple_paths(
                G_simple, source=waypoints[i], target=waypoints[i + 1], weight="weight"
            )
            segment_options.append(list(islice(paths_gen, 10)))
        all_combinations = list(product(*segment_options))
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="No compliant route exists under current conditions.")

    # ── 6. FINAL EVALUATION ──
    # (Existing scoring and response logic follows...)
    scored_combinations = []
    baseline_candidates = []
    has_forced_hubs = bool(query.transit_hubs)

    for combo in all_combinations:
        # Standard Baseline
        bc = evaluate_route_combo(combo, G_filtered, node_risks, float(query.quantity), has_forced_hubs, False, False)
        if bc: baseline_candidates.append(bc)

        # Risk Adjusted 
        rac = evaluate_route_combo(combo, G_filtered, node_risks, float(query.quantity), has_forced_hubs, True, True)
        if rac: scored_combinations.append(rac)

    if not scored_combinations:
        raise HTTPException(status_code=404, detail="No compliant route exists after risk adjustment.")

    scored_combinations.sort(key=lambda x: x["total_transit_days"])
    top_3 = scored_combinations[:3]
    for i, route in enumerate(top_3): route["option"] = i + 1

    baseline_fastest_route = min(
        baseline_candidates,
        key=lambda route: (route["total_transit_days"], route["route_risk_level"]),
    )
    baseline_safest_route = min(
        baseline_candidates,
        key=lambda route: (route["route_risk_level"], route["total_transit_days"]),
    )

    baseline_fastest_route = attach_matching_option(baseline_fastest_route, top_3)
    baseline_safest_route = attach_matching_option(baseline_safest_route, top_3)

    # ── Final response (now type-safe and UI-friendly) ──
    route_cities = set()
    for route in top_3:
        for leg in route["route"]:
            route_cities.add(leg["from"])
            route_cities.add(leg["to"])

    city_coordinates = {
        city: city_to_coordinates[city]
        for city in route_cities
        if city in city_to_coordinates
    }

    return {
        "source":             query.source_city,
        "target":             query.target_city,
        "category_name":      query.category_name,
        "quantity":           float(query.quantity),
        "delivery_type":      query.delivery_type or "None",
        "transit_hubs":       query.transit_hubs or [],
        "dispatch_date":      dt.isoformat(),
        "priority_level":     query.priority_level,
        "recommended_routes": top_3,
        "node_risks":         node_risks,
        "city_coordinates":   city_coordinates,
        "baseline_fastest_route": baseline_fastest_route,
        "baseline_safest_route":  baseline_safest_route,
        "risk_checked_at":    format_risk_timestamp(current_time),
        "risk_sources":       RISK_SIGNAL_SOURCES,
    }

@app.post("/select_best_route")
def select_best_route(req: DecisionRequest):
    print("🤖 Gemini is analyzing the route options...")

    prompt = f"""
    You are a Chief Supply Chain Officer AI. Analyze these {len(req.routes)} route options
    and recommend the best one.

    CONTEXT:
    - Customer Priority Level: {req.priority_level}
      (If 'Same Day' or 'First Class', time is critical. If 'Standard', safety is more important.)

    THE OPTIONS:
    {json.dumps(req.routes, indent=2)}

    CURRENT GLOBAL RISKS:
    {json.dumps(req.node_risks, indent=2)}

    INSTRUCTIONS:
    1. Weigh total_transit_days against route_risk_level.
    2. High priority → tolerate slightly more risk for speed.
       Low priority  → choose the safest route.
    3. Return ONLY a JSON object matching the required schema.
    """

    print(f"🚨 API CALL [GEMINI - DECISION]: model={decision_model.model_name}")
    try:
        response = gemini_decision_with_retry(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=GeminiDecisionOutput,
            ),
        )
        return json.loads(response.text)

    except Exception as e:
        print(f"⚠️ Gemini Decision Error (all retries exhausted): {e}")
        return {
            "recommended_option": 1,
            "executive_summary": (
                "Option 1 selected by default — AI analysis unavailable due to rate limiting. "
                "This is the mathematically fastest route; review risk scores manually."
            ),
            "trade_offs": [
                "Option 1 is the fastest but risk factors were not AI-assessed.",
                "Consider reviewing node_risks in the response payload directly.",
            ],
        }
#------------------------------------------------#
# Post route for live tracking                   #
#------------------------------------------------#
@app.post("/live_track")
def live_track(req: LiveTrackRequest):
    print("📡 Live tracking request received:", req.route_id)
 
    cities           = [city["city_name"] for city in req.cities]
    current_city_idx = req.current_city_index
 
    # ── Guard: nothing to re-route ────────────────────────────────────────────
    if current_city_idx < 0 or current_city_idx >= len(cities) - 1:
        return {"status": "no_reroute", "message": "No re-routing needed", "flag": 0}
 
    source_city = cities[current_city_idx]   # last completed city
    target_city = cities[-1]                 # final destination
    print(f"🔀 Re-routing from '{source_city}' → '{target_city}'")
 
    # ── Cities still ahead, excluding final destination ───────────────────────
    # We assess risk only on intermediate cities (the ones that can be avoided).
    # The destination itself can't be avoided so no point penalising it.
    remaining_cities = [normalize_city(c) for c in cities[current_city_idx+1:-1]]
    print(f"🌍 Assessing risk for: {remaining_cities}")
 
    # ── Call risk engine ──────────────────────────────────────────────────────
    # assess_route_risk returns the full RiskState dict.
    # The usable output is result["final_risk"]:
    #   { "Mumbai": {"risk": 0.7, "reason": "...", "components": {...}}, ... }
    try:
        risk_checked_ts = time.time()
        node_risks = stamp_node_risks(assess_route_risk(remaining_cities, req.mock_disruption_city, req.mock_disruption_type), risk_checked_ts)
        print(f"✅ node_risks: {node_risks}")
    except Exception as e:
        print(f"❌ Risk assessment failed: {e}")
        node_risks = {}
        risk_checked_ts = time.time()
 
    # ── Detect high-risk cities ───────────────────────────────────────────────
    # node_risks values are always dicts like {"risk": float, "reason": str, ...}
    high_risk_cities = [
        city for city, data in node_risks.items()
        if isinstance(data, dict) and data.get("risk", 0.0) > 0.4
    ]
 
    if not high_risk_cities:
        print("✅ No high-risk cities — current route is fine")
        return {
            "status":     "no_reroute_needed",
            "message":    "No high-risk cities on remaining route",
            "flag":       0,
            "node_risks": node_risks,
            "risk_checked_at": format_risk_timestamp(risk_checked_ts),
            "risk_sources": RISK_SIGNAL_SOURCES,
        }
 
    print(f"⚠️ High-risk cities: {high_risk_cities} — finding alternate route")
 
    # ── Build RouteRequest for find_top_route ─────────────────────────────────
    reroute_query = RouteRequest(
        source_city    = source_city,
        target_city    = target_city,
        category_name  = req.category,
        quantity       = 1.0,
        delivery_type  = req.delivery_type,
        transit_hubs   = [],
        dispatch_date  = req.dispatch_date,
        priority_level = "Standard Class",
    )
 
    # ── Find best alternate route ─────────────────────────────────────────────
    try:
        best_route = find_top_route(reroute_query, node_risks)
    except HTTPException as e:
        print(f"❌ Re-routing failed: {e.detail}")
        return {
            "status":     "error",
            "message":    e.detail,
            "flag":       0,
            "node_risks": node_risks,
            "risk_checked_at": format_risk_timestamp(risk_checked_ts),
            "risk_sources": RISK_SIGNAL_SOURCES,
        }
 
    print(f"✅ Re-route found: {best_route['total_transit_days']} days, "
          f"risk={best_route['route_risk_level']}")
 
    # ── Build updated_route for frontend ─────────────────────────────────────
    # Frontend reads response.data.updated_route as the new selected_route.route
    # Shape: [{"city": str, "status": "pending", "mode": str, "days": float}, ...]
    new_legs      = best_route["route"]
    all_cities    = [leg["from"] for leg in new_legs] + [new_legs[-1]["to"]]
    updated_route = []
    for i, city in enumerate(all_cities):
        city_data = {"city": city, "status": "pending"}
        # Add mode and days for all cities except the last one (no transport from destination)
        if i < len(new_legs):
            leg = new_legs[i]
            city_data["mode"] = leg["mode"]
            city_data["days"] = leg["days"]
        updated_route.append(city_data)
 
    # flag=1 is what triggers the in-card re-route notification on the frontend
    print(f"✅ Re-route notification triggered: {updated_route}")
    return {
        "status":             "rerouted",
        "message":            f"Re-routed — avoided: {high_risk_cities}",
        "flag":               1,
        "source":             source_city,
        "target":             target_city,
        "category_name":      req.category,
        "quantity":           1.0,
        "delivery_type":      req.delivery_type,
        "dispatch_date":      req.dispatch_date,
        "recommended_routes": [best_route],
        "node_risks":         node_risks,
        "updated_route":      updated_route,
        "risk_checked_at":    format_risk_timestamp(risk_checked_ts),
        "risk_sources":       RISK_SIGNAL_SOURCES,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
