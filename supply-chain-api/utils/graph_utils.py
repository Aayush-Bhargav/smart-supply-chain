import json
import math
import os
from datetime import datetime
from typing import Optional, Union

import joblib
import networkx as nx
import numpy as np
import torch

from utils.config import (
    INFER_NODES_FILE, 
    INFER_EDGES_FILE, 
    CATEGORY_MAPPING_FILE, 
    MODEL_FILE, 
    NODE_SCALER_FILE, 
    EDGE_SCALER_FILE
)
from utils.constants import (
    PRIORITY_TO_ENCODING,
    PRIORITY_TO_SCHEDULED_DAYS,
    CATEGORY_START_IDX,
    DIST_IDX,
    CROSS_BORDER_IDX,
    MONTH_SIN_IDX,
    MONTH_COS_IDX,
    DAY_SIN_IDX,
    DAY_COS_IDX,
    HOUR_SIN_IDX,
    HOUR_COS_IDX,
    SCHEDULED_DAYS_IDX,
    PREFERENCE_IDX,
    QUANTITY_IDX,
    PHYSICAL_MODE_IDX
)

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def get_physics_baseline(dist_km, mode):
    if mode == "Air":
        return (dist_km / (800 * 24)) + 0.5
    if mode == "Truck":
        return (dist_km * 1.28) / (70 * 24) + 0.5
    if mode == "Ocean":
        return (dist_km / (35 * 24)) + 2.0
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

def load_graph_data():
    """Load all required data files"""
    print("📂 Loading graph data...")
    
    # Load graph structure
    with open(INFER_NODES_FILE, "r") as f:
        nodes_data = json.load(f)
    with open(INFER_EDGES_FILE, "r") as f:
        edges_data = json.load(f)
    
    # Load category mapping
    with open(CATEGORY_MAPPING_FILE, "r") as f:
        category_to_idx = json.load(f)
    num_categories = len(category_to_idx)
    
    # Load scalers
    node_scaler = joblib.load(NODE_SCALER_FILE)
    edge_scaler = joblib.load(EDGE_SCALER_FILE)
    
    return nodes_data, edges_data, category_to_idx, num_categories, node_scaler, edge_scaler

def build_graph(nodes_data, edges_data):
    """Build NetworkX graph from node and edge data"""
    print("🕸️  Building graph...")
    
    G = nx.MultiDiGraph()
    id_to_city = {}
    id_map = {}
    
    for idx, node in enumerate(nodes_data):
        node_id = node["node_id"]  # Fixed: use node_id instead of id
        city = node["name"]
        id_to_city[node_id] = city
        id_map[city] = node_id
        G.add_node(node_id, **node)
    
    for edge in edges_data:
        src = edge["source"]
        tgt = edge["target"]
        src_country = edge["source_country"]
        tgt_country = edge["target_country"]
        mode = edge["mode"]
        dist_km = edge.get("distance_km", edge["features"][0])
        
        base_time = get_physics_baseline(dist_km, mode)
        
        key = G.add_edge(
            src,
            tgt,
            source_country=src_country,
            target_country=tgt_country,
            weight=base_time,
            base_time=base_time,
            mode=mode,
            distance_km=dist_km,
        )
    
    return G, id_to_city, id_map
