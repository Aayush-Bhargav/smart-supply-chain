import json
import math
import os
from typing import Dict, List, Optional, Tuple

import numpy as np
from sklearn.neighbors import NearestNeighbors

print("🚀 Building INFERENCE graph (separate from training graph)...")

# ============================================================
# FILES
# ============================================================
TRAIN_NODES_FILE = "nodes.json"
TRAIN_EDGES_FILE = "edges.json"

INFER_NODES_FILE = "nodes_inference.json"
INFER_EDGES_FILE = "edges_inference.json"
INFER_GRAPH_FILE = "graph_inference.json"

CATEGORY_MAPPING_FILE = "category_mapping.json"
FEATURE_SCHEMA_FILE = "feature_schema.json"

BIDIRECTIONAL = True

# ============================================================
# LOAD TRAIN GRAPH
# ============================================================
with open(TRAIN_NODES_FILE, "r", encoding="utf-8") as f:
    nodes = json.load(f)

with open(TRAIN_EDGES_FILE, "r", encoding="utf-8") as f:
    train_edges = json.load(f)

# Save a copy of nodes for inference
with open(INFER_NODES_FILE, "w", encoding="utf-8") as f:
    json.dump(nodes, f, indent=2, ensure_ascii=False)

node_by_id = {n["node_id"]: n for n in nodes}

# Exclusion set for train edges
train_edge_set = set((e["source"], e["target"], e["mode"]) for e in train_edges)

# ============================================================
# CATEGORY MAPPING (SAME AS TRAINING)
# ============================================================
if os.path.exists(CATEGORY_MAPPING_FILE):
    with open(CATEGORY_MAPPING_FILE, "r", encoding="utf-8") as f:
        category_to_idx = json.load(f)
else:
    categories = sorted(
        {
            e["category"]
            for e in train_edges
            if "category" in e and e["category"] not in [None, "", "Synthetic"]
        }
    )
    category_to_idx = {cat: i for i, cat in enumerate(categories)}
    with open(CATEGORY_MAPPING_FILE, "w", encoding="utf-8") as f:
        json.dump(category_to_idx, f, indent=2, ensure_ascii=False)

idx_to_category = {int(v): k for k, v in category_to_idx.items()}
NUM_CATEGORIES = len(category_to_idx)

# ============================================================
# INFRASTRUCTURE SETS
# ============================================================
ROAD_FACTOR = 1.28
AIR_MIN_DISTANCE_KM = 600
OCEAN_MIN_DISTANCE_KM = 1500
TRUCK_MAX_SAME_COUNTRY_KM = 1200
TRUCK_MAX_CROSS_BORDER_KM = 900

HAS_AIRPORT = {
    "New York City", "New York", "Los Angeles", "Los Ángeles",
    "London", "Paris", "Tokyo", "Tokio", "Mumbai", "Chicago", "Miami",
    "Shanghai", "Shanghái", "Singapore", "Singapur", "Sydney", "São Paulo",
    "Delhi", "New Delhi", "Frankfurt", "Beijing", "Pekín",
    "Dubai", "Atlanta", "Dallas", "Baltimore", "Honolulu", "Indianapolis",
    "Las Vegas", "Washington", "Manchester", "Memphis", "New Orleans",
    "Bogotá", "Charlotte", "Salt Lake City", "Cincinnati", "Denver",
    "Seattle", "Minneapolis", "Detroit", "Orlando", "Boston", "San Diego",
    "Phoenix", "Philadelphia", "Guatemala City", "San Salvador", "San Jose",
    "Sacramento", "Austin", "Raleigh", "Edmonton", "Calgary", "Vancouver",
    "Ottawa", "Montréal", "Munich", "Berlin", "Madrid", "Rome", "Milan",
    "Vienna", "Stockholm", "Oslo", "Helsinki", "Copenhagen", "Budapest",
    "Warsaw", "Prague", "Cairo", "Nairobi", "Johannesburg", "Bangkok",
    "Jakarta", "Manila", "Taipei", "Seoul"
}

HAS_SEAPORT = {
    "Los Angeles", "New York City", "Shanghai", "Singapore", "Mumbai", "Miami",
    "Rotterdam", "Busan", "Houston", "Barcelona", "Cape Town", "Durban",
    "Lagos", "Dakar", "Montevideo", "Dar es Salaam", "Tampa", "Naples",
    "Cagliari", "Luanda", "Xiamen", "Athens", "Auckland", "Casablanca",
    "Surabaya", "Adelaide", "Veracruz", "Genoa", "Recife", "Jacksonville",
    "Valencia", "Maputo", "Lisbon", "Guangzhou", "Brisbane", "Melbourne",
    "Haifa", "Port Said", "Dalian", "Hobart", "Callao", "Antalya"
}

ISLAND_TERRITORIES = {
    "Puerto Rico", "Martinique", "Guadeloupe", "Cuba", "Bahamas",
    "Jamaica", "Haiti", "Dominican Republic", "Barbados",
    "Trinidad and Tobago", "Bermuda", "Aruba", "Curaçao"
}

KNOWN_LAND_BORDER_PAIRS = {
    frozenset({"United States", "Canada"}),
    frozenset({"United States", "Mexico"}),
}

PHYSICAL_MODE_TO_IDX = {
    "Truck": 0.0,
    "Air": 1.0,
    "Ocean": 2.0,
}

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

def road_distance_km(dist_km):
    return dist_km * ROAD_FACTOR

def is_island(node):
    return node["name"] in ISLAND_TERRITORIES or node["country"] in ISLAND_TERRITORIES

def infer_physical_mode(src, tgt):
    """
    Inference graph mode is fixed by infrastructure heuristics:
      1) port-to-port long haul -> Ocean
      2) airport-to-airport -> Air
      3) road-feasible -> Truck
      4) otherwise -> None
    """
    src_city = src["name"]
    tgt_city = tgt["name"]

    src_air = src_city in HAS_AIRPORT
    tgt_air = tgt_city in HAS_AIRPORT
    src_sea = src_city in HAS_SEAPORT
    tgt_sea = tgt_city in HAS_SEAPORT

    src_island = is_island(src)
    tgt_island = is_island(tgt)

    dist_km = haversine(src["lat"], src["lon"], tgt["lat"], tgt["lon"])
    road_km = road_distance_km(dist_km)

    same_country = src["country"] == tgt["country"]
    land_border = frozenset({src["country"], tgt["country"]}) in KNOWN_LAND_BORDER_PAIRS

    if src_sea and tgt_sea and dist_km >= OCEAN_MIN_DISTANCE_KM and src["country"] != tgt["country"]:
        return "Ocean"

    if src_air and tgt_air and dist_km >= AIR_MIN_DISTANCE_KM:
        return "Air"

    if src_island or tgt_island:
        return None

    if same_country and road_km <= TRUCK_MAX_SAME_COUNTRY_KM:
        return "Truck"

    if land_border and road_km <= TRUCK_MAX_CROSS_BORDER_KM:
        return "Truck"

    return None

def one_hot_category(category_name: Optional[str], num_categories: int) -> List[float]:
    vec = [0.0] * num_categories
    if category_name is None:
        return vec
    idx = category_to_idx.get(category_name)
    if idx is not None:
        vec[idx] = 1.0
    return vec

def build_edge_features(
    src: dict,
    tgt: dict,
    mode: str,
    category_name: Optional[str] = None,
    quantity: float = 0.0,
    preference_encoded: float = 0.0,
):
    dist_km = haversine(src["lat"], src["lon"], tgt["lat"], tgt["lon"])
    cross_border = 1.0 if src["country"] != tgt["country"] else 0.0

    # Match training feature order exactly:
    # [dist, cross_border, month_sin, month_cos, day_sin, day_cos,
    #  hour_sin, hour_cos, scheduled_days, shipping_preference, quantity, physical_mode, category_one_hot...]
    features = [
        float(dist_km),
        float(cross_border),
        0.0, 1.0,   # month_sin, month_cos placeholder
        0.0, 1.0,   # day_sin, day_cos placeholder
        0.0, 1.0,   # hour_sin, hour_cos placeholder
        0.0,        # scheduled days placeholder
        float(preference_encoded),
        float(quantity),
        float(PHYSICAL_MODE_TO_IDX.get(mode, 1.0)),
        *one_hot_category(category_name, NUM_CATEGORIES),
    ]
    return features

def add_directed_edge(
    src: dict,
    tgt: dict,
    mode: str,
    edge_list: list,
    edge_set: set,
    category_name: Optional[str] = None,
    quantity: float = 0.0,
    preference_encoded: float = 0.0,
):
    key = (src["node_id"], tgt["node_id"], mode)
    if key in train_edge_set or key in edge_set:
        return False

    cross_border = 1.0 if src["country"] != tgt["country"] else 0.0
    dist_km = haversine(src["lat"], src["lon"], tgt["lat"], tgt["lon"])

    edge_list.append({
        "source": src["node_id"],
        "target": tgt["node_id"],
        "features": build_edge_features(
            src=src,
            tgt=tgt,
            mode=mode,
            category_name=category_name,
            quantity=quantity,
            preference_encoded=preference_encoded,
        ),
        "weight": None,
        "mode": mode,
        "category": category_name,
        "quantity": quantity,
        "cross_border": cross_border,
        "source_country": src["country"],
        "target_country": tgt["country"],
        "distance_km": float(dist_km),
    })
    edge_set.add(key)
    return True

# ============================================================
# BUILD CANDIDATE LISTS
# ============================================================
valid_nodes = [n for n in nodes if n.get("lat") is not None and n.get("lon") is not None]
coords = np.array([[n["lat"], n["lon"]] for n in valid_nodes], dtype=float)
node_ids = [n["node_id"] for n in valid_nodes]

inference_edges = []
inference_edge_set = set()

# ============================================================
# 1) TRUCK BACKBONE: KNN over all nodes
# ============================================================
print("🚚 Building truck backbone...")
K_TRUCK = 6

if len(valid_nodes) >= 2:
    n_neighbors = min(K_TRUCK + 1, len(valid_nodes))
    nn = NearestNeighbors(n_neighbors=n_neighbors, metric="haversine")
    nn.fit(np.radians(coords))
    dists, idxs = nn.kneighbors(np.radians(coords))

    for i, src_id in enumerate(node_ids):
        src = node_by_id[src_id]
        for j in range(1, n_neighbors):
            tgt_id = node_ids[idxs[i][j]]
            if src_id == tgt_id:
                continue

            tgt = node_by_id[tgt_id]
            mode = infer_physical_mode(src, tgt)
            if mode != "Truck":
                continue

            added = add_directed_edge(src, tgt, "Truck", inference_edges, inference_edge_set)
            if BIDIRECTIONAL and added:
                add_directed_edge(tgt, src, "Truck", inference_edges, inference_edge_set)

print("✅ Truck backbone done.")

# ============================================================
# 2) AIR BACKBONE: airport-only KNN
# ============================================================
print("✈️ Building air backbone...")
airport_nodes = [n for n in valid_nodes if n["name"] in HAS_AIRPORT]

if len(airport_nodes) >= 2:
    airport_coords = np.array([[n["lat"], n["lon"]] for n in airport_nodes], dtype=float)
    airport_ids = [n["node_id"] for n in airport_nodes]

    K_AIR = 8
    n_neighbors = min(K_AIR + 1, len(airport_nodes))
    nn_air = NearestNeighbors(n_neighbors=n_neighbors, metric="haversine")
    nn_air.fit(np.radians(airport_coords))
    dists_air, idxs_air = nn_air.kneighbors(np.radians(airport_coords))

    for i, src_id in enumerate(airport_ids):
        src = node_by_id[src_id]
        for j in range(1, n_neighbors):
            tgt_id = airport_ids[idxs_air[i][j]]
            if src_id == tgt_id:
                continue

            tgt = node_by_id[tgt_id]
            mode = infer_physical_mode(src, tgt)
            if mode != "Air":
                continue

            added = add_directed_edge(src, tgt, "Air", inference_edges, inference_edge_set)
            if BIDIRECTIONAL and added:
                add_directed_edge(tgt, src, "Air", inference_edges, inference_edge_set)

print("✅ Air backbone done.")

# ============================================================
# 3) OCEAN BACKBONE: seaport-only KNN
# ============================================================
print("🚢 Building ocean backbone...")
seaport_nodes = [n for n in valid_nodes if n["name"] in HAS_SEAPORT]

if len(seaport_nodes) >= 2:
    seaport_coords = np.array([[n["lat"], n["lon"]] for n in seaport_nodes], dtype=float)
    seaport_ids = [n["node_id"] for n in seaport_nodes]

    K_OCEAN = 8
    n_neighbors = min(K_OCEAN + 1, len(seaport_nodes))
    nn_sea = NearestNeighbors(n_neighbors=n_neighbors, metric="haversine")
    nn_sea.fit(np.radians(seaport_coords))
    dists_sea, idxs_sea = nn_sea.kneighbors(np.radians(seaport_coords))

    for i, src_id in enumerate(seaport_ids):
        src = node_by_id[src_id]
        for j in range(1, n_neighbors):
            tgt_id = seaport_ids[idxs_sea[i][j]]
            if src_id == tgt_id:
                continue

            tgt = node_by_id[tgt_id]
            mode = infer_physical_mode(src, tgt)
            if mode != "Ocean":
                continue

            added = add_directed_edge(src, tgt, "Ocean", inference_edges, inference_edge_set)
            if BIDIRECTIONAL and added:
                add_directed_edge(tgt, src, "Ocean", inference_edges, inference_edge_set)

print("✅ Ocean backbone done.")

# ============================================================
# SAVE INFERENCE GRAPH
# ============================================================
feature_schema = {
    "feature_order": [
        "distance_km",
        "cross_border",
        "month_sin",
        "month_cos",
        "day_sin",
        "day_cos",
        "hour_sin",
        "hour_cos",
        "scheduled_days",
        "shipping_preference_encoded",
        "quantity",
        "physical_mode_encoded",
        "category_one_hot"
    ],
    "physical_mode_encoding": PHYSICAL_MODE_TO_IDX,
    "num_categories": NUM_CATEGORIES,
    "category_mapping_file": CATEGORY_MAPPING_FILE,
    "train_files": {
        "nodes": TRAIN_NODES_FILE,
        "edges": TRAIN_EDGES_FILE
    }
}

with open(FEATURE_SCHEMA_FILE, "w", encoding="utf-8") as f:
    json.dump(feature_schema, f, indent=2, ensure_ascii=False)

with open(INFER_EDGES_FILE, "w", encoding="utf-8") as f:
    json.dump(inference_edges, f, indent=2, ensure_ascii=False)

with open(INFER_GRAPH_FILE, "w", encoding="utf-8") as f:
    json.dump(
        {
            "nodes": nodes,
            "edges": inference_edges,
            "feature_schema": feature_schema,
            "category_mapping": category_to_idx,
        },
        f,
        indent=2,
        ensure_ascii=False
    )

print("💾 Saved inference graph files:")
print(f"  - {INFER_NODES_FILE}")
print(f"  - {INFER_EDGES_FILE}")
print(f"  - {INFER_GRAPH_FILE}")
print(f"  - {FEATURE_SCHEMA_FILE}")
print(f"  - {CATEGORY_MAPPING_FILE}")
print(f"Nodes: {len(nodes)}")
print(f"Edges: {len(inference_edges)}")