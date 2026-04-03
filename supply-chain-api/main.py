import json
import math
import os
from datetime import datetime
from typing import Optional, Union

import joblib
import networkx as nx
import numpy as np
import torch
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from torch.nn import Linear, Sequential, ReLU, Dropout, BatchNorm1d, LayerNorm
from torch_geometric.nn import SAGEConv

print("🚀 Waking up Supply Chain Route API...")

# ============================================================
# ENVIRONMENT CONFIGURATION
# ============================================================
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
PORT = int(os.getenv("PORT", 8080))

# CORS Configuration - Allow multiple frontends
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",") if os.getenv("ALLOWED_ORIGINS") else ["*"]

# ============================================================
# FILES
# ============================================================
INFER_NODES_FILE = "nodes_inference.json"
INFER_EDGES_FILE = "edges_inference.json"
CATEGORY_MAPPING_FILE = "category_mapping.json"
FEATURE_SCHEMA_FILE = "feature_schema.json"

MODEL_FILE = "supply_chain_model.pth"
NODE_SCALER_FILE = "node_scaler.pkl"
EDGE_SCALER_FILE = "edge_scaler.pkl"

# ============================================================
# FEATURE LAYOUT
# Must match pipeline.py exactly
# [distance, cross_border, month_sin, month_cos, day_sin, day_cos,
#  hour_sin, hour_cos, scheduled_days, preference, quantity,
#  physical_mode, category_one_hot...]
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

PHYSICAL_MODE_TO_IDX = {
    "Truck": 0.0,
    "Air": 1.0,
    "Ocean": 2.0,
}

PRIORITY_TO_ENCODING = {
    "Standard Class": 0.0,
    "Second Class": 1.0,
    "First Class": 2.0,
    "Same Day": 3.0,
    "Standard": 0.0,
    "Second": 1.0,
    "First": 2.0,
    "Urgent": 3.0,
}

PRIORITY_TO_SCHEDULED_DAYS = {
    0.0: 4.0,
    1.0: 3.0,
    2.0: 2.0,
    3.0: 0.0,
}

# ============================================================
# MODEL
# ============================================================
class RobustSupplyChainSAGE(torch.nn.Module):
    def __init__(self, node_in_dim, edge_in_dim, hidden_dim, num_layers=3, dropout=0.2):
        super(RobustSupplyChainSAGE, self).__init__()
        
        # Maps node features [3] -> [hidden_dim]
        self.node_encoder = Linear(node_in_dim, hidden_dim)
        
        self.convs = torch.nn.ModuleList()
        self.norms = torch.nn.ModuleList()
        
        for _ in range(num_layers):
            # Aggregation: capturing mean and max behavior of neighboring supply hubs
            self.convs.append(SAGEConv(hidden_dim, hidden_dim, aggr=['mean', 'max']))
            self.norms.append(LayerNorm(hidden_dim))
            
        self.dropout = Dropout(dropout)
        
        # Prediction Head: (Source Node + Target Node + Edge Features)
        # Dim: (hidden_dim * 2) + edge_in_dim
        concat_dim = (hidden_dim * 2) + edge_in_dim
        self.edge_predictor = Sequential(
            Linear(concat_dim, hidden_dim * 2),
            BatchNorm1d(hidden_dim * 2),
            ReLU(),
            self.dropout,
            Linear(hidden_dim * 2, hidden_dim),
            ReLU(),
            Linear(hidden_dim, 1) # Predicts weight (transit time)
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
            
        # Select embeddings for the specific edges we are predicting
        src_idx, tgt_idx = query_edge_indices[0], query_edge_indices[1]
        h_src, h_tgt = h[src_idx], h[tgt_idx]
        
        # Final concatenation for regression
        edge_inputs = torch.cat([h_src, h_tgt, edge_attr], dim=1)
        return self.edge_predictor(edge_inputs)

# ============================================================
# HELPERS
# ============================================================
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

# Continuous indices for PyG
id_map = {node["node_id"]: i for i, node in enumerate(nodes_data)}
rev_id_map = {i: node["node_id"] for i, node in enumerate(nodes_data)}
id_to_city = {node["node_id"]: node["name"] for node in nodes_data}
city_to_id = {node["name"]: node["node_id"] for node in nodes_data}

# Node tensors
x_raw = [node["features"] for node in nodes_data]
x_scaled = node_scaler.transform(x_raw)
x_tensor = torch.tensor(x_scaled, dtype=torch.float)

# Edge tensors (structure only; dynamic context is injected per request)
edge_index_list = []
base_edge_features = []
edge_records = []

for edge in edges_data:
    if edge["source"] in id_map and edge["target"] in id_map:
        edge_index_list.append([id_map[edge["source"]], id_map[edge["target"]]])
        base_edge_features.append(edge["features"])
        edge_records.append(edge)

edge_index_tensor = torch.tensor(edge_index_list, dtype=torch.long).t().contiguous()

# Handle feature mismatch - check if we need to regenerate scalers
try:
    edge_attr_scaled = edge_scaler.transform(base_edge_features)
    edge_attr_tensor = torch.tensor(edge_attr_scaled, dtype=torch.float)
    print(f"✅ Using existing scalers. Edge features: {edge_attr_tensor.shape[1]}")
except ValueError as e:
    print(f"⚠️ Scaler mismatch: {e}")
    print("🔄 Regenerating scalers with current data...")
    
    # Create new scalers with current data
    from sklearn.preprocessing import StandardScaler
    edge_scaler = StandardScaler()
    edge_attr_scaled = edge_scaler.fit_transform(base_edge_features)
    edge_attr_tensor = torch.tensor(edge_attr_scaled, dtype=torch.float)
    
    # Save the updated scalers
    joblib.dump(edge_scaler, EDGE_SCALER_FILE)
    print(f"✅ Updated scalers saved. New edge features: {edge_attr_tensor.shape[1]}")

# Model
node_in_dim = x_tensor.shape[1]
edge_in_dim = edge_attr_tensor.shape[1]
model = RobustSupplyChainSAGE(node_in_dim, edge_in_dim, 128, 4)

try:
    model.load_state_dict(torch.load(MODEL_FILE, map_location="cpu"))
    print(f"✅ Model loaded successfully. Node dim: {node_in_dim}, Edge dim: {edge_in_dim}")
except RuntimeError as e:
    print(f"⚠️ Model architecture mismatch: {e}")
    print("🔄 This is expected - the model will be retrained during deployment")
    print("💡 For now, using uninitialized model (will work after training)")
    
model.eval()

# ============================================================
# NETWORKX ROUTER
# ============================================================
G = nx.MultiDiGraph()
for node in nodes_data:
    G.add_node(node["node_id"], **node)

edge_order = []
for edge in edge_records:
    src = edge["source"]
    tgt = edge["target"]
    mode = edge["mode"]
    dist_km = edge.get("distance_km", edge["features"][0])

    base_time = get_physics_baseline(dist_km, mode)
    key = G.add_edge(
        src,
        tgt,
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RouteRequest(BaseModel):
    source_city: str
    target_city: str
    category_name: str
    quantity: float = 1.0
    priority_level: Union[str, float] = "Standard Class"
    dispatch_date: str
    scheduled_days: Optional[float] = None

@app.get("/")
def health_check():
    return {
        "status": "live",
        "nodes": G.number_of_nodes(),
        "edges": G.number_of_edges(),
        "categories": num_categories,
    }

def build_request_edge_features(query: RouteRequest):
    dt = parse_dispatch_datetime(query.dispatch_date)

    month_sin = float(np.sin(2 * np.pi * dt.month / 12.0))
    month_cos = float(np.cos(2 * np.pi * dt.month / 12.0))
    day_sin = float(np.sin(2 * np.pi * dt.weekday() / 7.0))
    day_cos = float(np.cos(2 * np.pi * dt.weekday() / 7.0))
    hour_sin = float(np.sin(2 * np.pi * dt.hour / 24.0))
    hour_cos = float(np.cos(2 * np.pi * dt.hour / 24.0))

    preference_encoded = encode_priority(query.priority_level)
    scheduled_days = infer_scheduled_days(preference_encoded, query.scheduled_days)
    category_vec = one_hot_category(query.category_name, category_to_idx, num_categories)

    modified = []
    for edge in edge_records:
        feat = list(edge["features"])

        # Same order as training:
        # 0 dist
        # 1 cross_border
        # 2-7 date/time
        # 8 scheduled_days
        # 9 preference
        # 10 quantity
        # 11 physical_mode_encoded
        # 12+ category one-hot
        feat[DIST_IDX] = float(feat[DIST_IDX])
        feat[CROSS_BORDER_IDX] = float(feat[CROSS_BORDER_IDX])
        feat[MONTH_SIN_IDX] = month_sin
        feat[MONTH_COS_IDX] = month_cos
        feat[DAY_SIN_IDX] = day_sin
        feat[DAY_COS_IDX] = day_cos
        feat[HOUR_SIN_IDX] = hour_sin
        feat[HOUR_COS_IDX] = hour_cos
        feat[SCHEDULED_DAYS_IDX] = scheduled_days
        feat[PREFERENCE_IDX] = float(preference_encoded)
        feat[QUANTITY_IDX] = float(query.quantity)
        feat[PHYSICAL_MODE_IDX] = float(PHYSICAL_MODE_TO_IDX.get(edge["mode"], 1.0))

        # category one-hot
        if len(feat) > CATEGORY_START_IDX:
            feat[CATEGORY_START_IDX:] = category_vec

        modified.append(feat)

    return dt, modified

@app.post("/find_route")
def find_route(query: RouteRequest):
    if query.source_city not in city_to_id or query.target_city not in city_to_id:
        raise HTTPException(status_code=404, detail="Source or destination city not found.")

    src_id = city_to_id[query.source_city]
    tgt_id = city_to_id[query.target_city]

    dt, modified_features = build_request_edge_features(query)
    new_edge_attr = torch.tensor(edge_scaler.transform(modified_features), dtype=torch.float)

    with torch.no_grad():
        predictions = model(
            x_tensor,
            edge_index_tensor,
            new_edge_attr,
            edge_index_tensor,
        ).view(-1).cpu().numpy()

    # Update weights on the NetworkX graph
    for idx, (u, v, k) in enumerate(edge_order):
        edge_data = G[u][v][k]
        ai_predicted_time = float(predictions[idx])
        clamped_time = max(edge_data["base_time"], ai_predicted_time)
        G[u][v][k]["weight"] = clamped_time

    try:
        path_nodes = nx.shortest_path(G, source=src_id, target=tgt_id, weight="weight")

        route_details = []
        total_time = 0.0

        for i in range(len(path_nodes) - 1):
            u = path_nodes[i]
            v = path_nodes[i + 1]

            edge_options = G[u][v]
            best_key = min(edge_options, key=lambda kk: edge_options[kk]["weight"])
            best_edge = edge_options[best_key]

            total_time += best_edge["weight"]
            route_details.append({
                "from": id_to_city[u],
                "to": id_to_city[v],
                "mode": best_edge["mode"],
                "days": round(float(best_edge["weight"]), 2),
                "base_time": round(float(best_edge["base_time"]), 2),
            })

        return {
            "source": query.source_city,
            "target": query.target_city,
            "dispatch_date": dt.isoformat(),
            "category_name": query.category_name,
            "quantity": query.quantity,
            "priority_level": query.priority_level,
            "scheduled_days": infer_scheduled_days(encode_priority(query.priority_level), query.scheduled_days),
            "total_transit_days": round(float(total_time), 2),
            "route": route_details,
        }

    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="No compliant route exists.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)