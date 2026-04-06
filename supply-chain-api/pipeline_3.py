import os
import json
import math
import time
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors
from geopy.geocoders import Nominatim

# ============================================================
# SUPPLY CHAIN GRAPH PIPELINE
# ============================================================
print("🚀 Starting Supply Chain Graph Pipeline...")

# ============================================================
# 1) CONFIG
# ============================================================
CSV_FILE = "DataCoSupplyChainDataset.csv"
CACHE_FILE = "city_coords_cache.json"
NROWS = None  # set to 25000 if you want to limit for faster iteration

K_TRUCK = 6                 # 5–6 nearest neighbors; use 6 here
K_AIR = 8                   # fewer than full mesh, enough to keep connectivity
K_OCEAN = 8

ROAD_FACTOR = 1.28          # road distance ~ geo distance * factor
TRUCK_MAX_SAME_COUNTRY_KM = 1200
TRUCK_MAX_CROSS_BORDER_KM = 900

AIR_MIN_DISTANCE_KM = 700
OCEAN_MIN_DISTANCE_KM = 1500

TRUCK_SPEED_KMPH = 70
AIR_SPEED_KMPH = 800
OCEAN_SPEED_KMPH = 35

AIR_RESTRICTED_GOODS = {"Hazardous", "Cleats"}
SHIP_RESTRICTED_GOODS = {"Perishables", "Fresh Produce", "Dairy"}

# Some well-known hubs
TIER_1_HUBS = {
    "New York City", "New York", "Nueva York",
    "Los Angeles", "Los Ángeles",
    "London", "Paris",
    "Tokyo", "Tokio",
    "Mumbai", "Chicago", "Miami",
    "Shanghai", "Shanghái",
    "Singapore", "Singapur",
    "Sydney", "São Paulo",
    "Delhi", "New Delhi",
    "Frankfurt", "Beijing", "Pekín"
}

HAS_SEAPORT = {
    "Los Angeles", "Los Ángeles", "New York City", "New York", "Nueva York",
    "Shanghai", "Shanghái", "Singapore", "Singapur", "Mumbai", "Miami",
    "Rotterdam", "Busan", "Houston", "Barcelona", "Cape Town",
    "Durban", "Lagos", "Dakar", "Montevideo", "Dar es Salaam",
    "Porto Alegre", "Tampa", "Naples", "Cagliari", "Luanda",
    "Xiamen", "Bristol", "Athens", "Auckland", "Casablanca",
    "Surabaya", "Adelaide", "Veracruz", "Genoa", "Recife",
    "Plymouth", "Jacksonville", "Valencia", "Maputo", "Nice",
    "Kuwait City", "Glasgow", "Lisbon", "Guangzhou", "Bordeaux",
    "Brisbane", "Melbourne", "Cienfuegos", "Haifa", "Port Said",
    "Dalian", "Cairns", "Hobart", "Callao", "Antalya"
}

HAS_AIRPORT = {
    "New York City", "New York", "Nueva York", "Los Angeles", "Los Ángeles",
    "London", "Paris", "Tokyo", "Tokio", "Mumbai", "Chicago", "Miami",
    "Shanghai", "Shanghái", "Singapore", "Singapur", "Sydney", "São Paulo",
    "Delhi", "New Delhi", "Frankfurt", "Beijing", "Pekín",
    "Dubai", "Atlanta", "Dallas", "Baltimore", "Honolulu", "Indianapolis",
    "Las Vegas", "Washington", "Manchester", "Memphis", "New Orleans",
    "Bogotá", "Charlotte", "Salt Lake City", "Cincinnati", "Denver",
    "Seattle", "Minneapolis", "Detroit", "Orlando", "Boston", "San Diego",
    "Phoenix", "Philadelphia", "Guatemala City", "San Salvador", "San Jose",
    "Sacramento", "Austin", "Raleigh", "Edmonton", "Calgary", "Vancouver",
    "Ottawa", "Montréal", "Munich", "Berlin", "Berlín",
    "Madrid", "Rome", "Milan", "Vienna", "Viena",
    "Stockholm", "Estocolmo", "Oslo", "Helsinki", "Copenhagen", "Budapest",
    "Warsaw", "Prague", "Praga", "Cairo", "Nairobi", "Johannesburg",
    "Bangkok", "Jakarta", "Yakarta", "Manila", "Taipei",
    "Seoul", "Seúl"
}

CARIBBEAN_ISLANDS = {
    "Puerto Rico", "Cuba", "Bahamas", "Jamaica", "Haiti", "Dominican Republic"
}

KNOWN_LAND_BORDER_PAIRS = {
    frozenset({"United States", "Canada"}),
    frozenset({"United States", "Mexico"}),
}

# ============================================================
# 2) GEOCODING CACHE
# ============================================================
geolocator = Nominatim(user_agent="smart_supply_chain_graph_pipeline_v3")

if os.path.exists(CACHE_FILE):
    print("📦 Loading geographic cache...")
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        coord_cache = json.load(f)
else:
    print("🌍 No cache found. Creating a new one...")
    coord_cache = {}

# ============================================================
# 3) HELPERS
# ============================================================
def normalize_city(x):
    if pd.isna(x):
        return None
    return str(x).strip()

def normalize_country(x):
    if pd.isna(x):
        return "Unknown"
    return str(x).strip()

def calculate_haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1_rad, lon1_rad = map(math.radians, [lat1, lon1])
    lat2_rad, lon2_rad = map(math.radians, [lat2, lon2])
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def get_global_region(lat, lon):
    if lon < -30:
        return "Americas"
    elif lon > 100 and lat < -10:
        return "Oceania"
    else:
        return "Afro-Eurasia"

def estimate_road_km(geo_km):
    return geo_km * ROAD_FACTOR

def truck_allowed(country1, country2, src_lat, src_lon, tgt_lat, tgt_lon):
    geo_km = calculate_haversine(src_lat, src_lon, tgt_lat, tgt_lon)
    road_km = estimate_road_km(geo_km)
    same_country = country1 == country2
    same_region = get_global_region(src_lat, src_lon) == get_global_region(tgt_lat, tgt_lon)

    if same_country:
        return road_km <= TRUCK_MAX_SAME_COUNTRY_KM, geo_km, road_km
    if same_region:
        return road_km <= TRUCK_MAX_CROSS_BORDER_KM, geo_km, road_km
    return False, geo_km, road_km

def get_destination_coords(city_name):
    city_name = normalize_city(city_name)
    if city_name in coord_cache:
        return tuple(coord_cache[city_name])

    print(f"   📡 Geocoding -> {city_name}")
    try:
        time.sleep(1.1)
        loc = geolocator.geocode(city_name, timeout=10)
        if loc:
            coords = (float(loc.latitude), float(loc.longitude))
        else:
            # deterministic fallback
            rs = np.random.RandomState(abs(hash(city_name)) % (2**32))
            coords = (float(rs.uniform(-40, 60)), float(rs.uniform(-120, 120)))

        coord_cache[city_name] = list(coords)
        return coords
    except Exception:
        rs = np.random.RandomState(abs(hash(city_name)) % (2**32))
        coords = (float(rs.uniform(-40, 60)), float(rs.uniform(-120, 120)))
        coord_cache[city_name] = list(coords)
        return coords

def infer_physical_mode(src_city, tgt_city, src_country, tgt_country, dist_km, actual_days):
    same_country = src_country == tgt_country
    same_region = False  # set below after we know coords

    # Ocean is only for clear port-to-port long-haul movement
    if src_city in HAS_SEAPORT and tgt_city in HAS_SEAPORT and dist_km >= OCEAN_MIN_DISTANCE_KM:
        if actual_days is None or actual_days >= 4:
            return "Ocean"

    # Truck for local / regional road-feasible movement
    # (the synthetic truck backbone will also use kNN + road limits)
    if dist_km <= 900 and same_country:
        return "Truck"
    if dist_km <= 700 and not same_country:
        return "Truck"

    # Otherwise air is the fallback for long-distance, fast, or non-port movement
    return "Air"

# ============================================================
# 4) LOAD DATA
# ============================================================
print("📊 Loading CSV...")
df = pd.read_csv(CSV_FILE, encoding="latin1", nrows=NROWS)

cols_to_keep = [
    "Customer City", "Customer Country", "Latitude", "Longitude",
    "Order City", "Order Country", "order date (DateOrders)",
    "Days for shipping (real)", "Days for shipment (scheduled)",
    "Shipping Mode", "Category Name", "Category Id",
    "Sales", "Benefit per order"
]
df = df[cols_to_keep].copy()

# Clean strings
for c in ["Customer City", "Customer Country", "Order City", "Order Country", "Shipping Mode", "Category Name"]:
    df[c] = df[c].fillna("").astype(str).str.strip()

# Numeric cleanup
for c in ["Latitude", "Longitude", "Days for shipping (real)", "Days for shipment (scheduled)", "Sales", "Benefit per order", "Category Id"]:
    df[c] = pd.to_numeric(df[c], errors="coerce")

df["order_date"] = pd.to_datetime(df["order date (DateOrders)"], errors="coerce")
df = df.dropna(subset=["Customer City", "Order City", "Customer Country", "Order Country", "Sales", "Benefit per order", "order_date"])
df = df[(df["Customer City"] != "") & (df["Order City"] != "")]

# Temporal features
df["month_sin"] = np.sin(2 * np.pi * df["order_date"].dt.month / 12.0)
df["month_cos"] = np.cos(2 * np.pi * df["order_date"].dt.month / 12.0)
df["day_sin"] = np.sin(2 * np.pi * df["order_date"].dt.dayofweek / 7.0)
df["day_cos"] = np.cos(2 * np.pi * df["order_date"].dt.dayofweek / 7.0)
df["hour_sin"] = np.sin(2 * np.pi * df["order_date"].dt.hour / 24.0)
df["hour_cos"] = np.cos(2 * np.pi * df["order_date"].dt.hour / 24.0)

# ============================================================
# 5) BUILD CITY NODES
# ============================================================
print("🏙️ Building node set...")

city_to_country = {}
city_rows = defaultdict(list)

for idx, row in df.iterrows():
    c1 = normalize_city(row["Customer City"])
    c2 = normalize_city(row["Order City"])
    city_to_country[c1] = normalize_country(row["Customer Country"])
    city_to_country[c2] = normalize_country(row["Order Country"])
    city_rows[c1].append(idx)
    city_rows[c2].append(idx)

unique_cities = sorted(set(df["Customer City"].unique()).union(set(df["Order City"].unique())))
city_to_id = {}
nodes_dict = {}

node_id = 0
for city in unique_cities:
    city = normalize_city(city)
    city_to_id[city] = node_id

    rows_for_city = df[(df["Customer City"] == city) | (df["Order City"] == city)]
    avg_sales = float(rows_for_city["Sales"].mean()) if not rows_for_city.empty else 50.0
    avg_profit = float(rows_for_city["Benefit per order"].mean()) if not rows_for_city.empty else 10.0

    if not rows_for_city.empty and rows_for_city["Category Id"].notna().any():
        try:
            dom_cat = float(rows_for_city["Category Id"].mode(dropna=True).iloc[0])
        except Exception:
            dom_cat = 0.0
    else:
        dom_cat = 0.0

    # Prefer lat/lon from customer rows if available; else geocode
    customer_rows = df[(df["Customer City"] == city) & df["Latitude"].notna() & df["Longitude"].notna()]
    if not customer_rows.empty:
        lat = float(customer_rows["Latitude"].iloc[0])
        lon = float(customer_rows["Longitude"].iloc[0])
    else:
        lat, lon = get_destination_coords(city)

    nodes_dict[node_id] = {
        "node_id": node_id,
        "name": city,
        "country": city_to_country.get(city, "Unknown"),
        "lat": lat,
        "lon": lon,
        "is_tier_1": city in TIER_1_HUBS,
        "features": [avg_sales, avg_profit, dom_cat]
    }

    node_id += 1

# Save cache
with open(CACHE_FILE, "w", encoding="utf-8") as f:
    json.dump(coord_cache, f, indent=2, ensure_ascii=False)

print(f"✅ Built {len(nodes_dict)} nodes.")

# ============================================================
# 6) BUILD HISTORICAL EDGES
# ============================================================
print("🔗 Building historical edges...")
edges_list = []
existing_edges = set()

mode_map = {
    "Standard Class": 0.0,
    "Second Class": 1.0,
    "First Class": 2.0,
    "Same Day": 3.0
}

for _, row in df.iterrows():
    src_city = normalize_city(row["Customer City"])
    tgt_city = normalize_city(row["Order City"])
    src_country = normalize_country(row["Customer Country"])
    tgt_country = normalize_country(row["Order Country"])

    if src_city not in city_to_id or tgt_city not in city_to_id:
        continue

    src_id = city_to_id[src_city]
    tgt_id = city_to_id[tgt_city]

    src_lat, src_lon = nodes_dict[src_id]["lat"], nodes_dict[src_id]["lon"]
    tgt_lat, tgt_lon = nodes_dict[tgt_id]["lat"], nodes_dict[tgt_id]["lon"]
    dist_km = calculate_haversine(src_lat, src_lon, tgt_lat, tgt_lon)

    actual_days = row["Days for shipping (real)"]
    scheduled_days = row["Days for shipment (scheduled)"]

    physical_mode = infer_physical_mode(
        src_city, tgt_city, src_country, tgt_country,
        dist_km, actual_days if pd.notna(actual_days) else None
    )

    is_cross_border = 1.0 if src_country != tgt_country else 0.0

    final_weight = float(actual_days) if pd.notna(actual_days) else float(scheduled_days) if pd.notna(scheduled_days) else 1.0
    if physical_mode == "Air" and row["Category Name"] in AIR_RESTRICTED_GOODS:
        final_weight = 999.0
    if physical_mode == "Ocean" and row["Category Name"] in SHIP_RESTRICTED_GOODS:
        final_weight = 999.0

    features = [
        float(dist_km),
        float(is_cross_border),
        float(row["month_sin"]),
        float(row["month_cos"]),
        float(row["day_sin"]),
        float(row["day_cos"]),
        float(row["hour_sin"]),
        float(row["hour_cos"]),
        float(scheduled_days) if pd.notna(scheduled_days) else 0.0,
        float(mode_map.get(row["Shipping Mode"], 0.0))
    ]

    edges_list.append({
        "source": src_id,
        "target": tgt_id,
        "features": features,
        "weight": final_weight,
        "mode": physical_mode,
        "category": row["Category Name"],
        "cross_border": is_cross_border,
        "source_country": src_country,
        "target_country": tgt_country
    })
    existing_edges.add((src_id, tgt_id, physical_mode))

print(f"✅ Historical edges: {len(edges_list)}")

# ============================================================
# 7) SYNTHETIC TRUCK BACKBONE (kNN + road limit)
# ============================================================
# ============================================================
# 7) SYNTHETIC TRUCK BACKBONE (FIXED – LAND-CONSTRAINED)
# ============================================================
print("🚚 Building truck backbone with realistic land constraints...")

ISLAND_TERRITORIES = {
    "Puerto Rico", "Martinique", "Guadeloupe", "Cuba", "Bahamas",
    "Jamaica", "Haiti", "Dominican Republic", "Barbados",
    "Trinidad and Tobago", "Bermuda", "Aruba", "Curaçao"
}

def is_island(city, country):
    return city in ISLAND_TERRITORIES or country in ISLAND_TERRITORIES


def is_truck_feasible(src_city, tgt_city, src_country, tgt_country,
                     src_lat, src_lon, tgt_lat, tgt_lon):

    # ❌ HARD RULE 1: No truck across islands
    if is_island(src_city, src_country) or is_island(tgt_city, tgt_country):
        return False, None

    geo_km = calculate_haversine(src_lat, src_lon, tgt_lat, tgt_lon)
    road_km = geo_km * ROAD_FACTOR

    # ✅ RULE 2: Same country → allowed within realistic distance
    if src_country == tgt_country:
        return road_km <= TRUCK_MAX_SAME_COUNTRY_KM, road_km

    # ✅ RULE 3: Only allow known land borders
    if frozenset({src_country, tgt_country}) in KNOWN_LAND_BORDER_PAIRS:
        return road_km <= TRUCK_MAX_CROSS_BORDER_KM, road_km

    # ❌ Otherwise no truck
    return False, None


all_node_ids = list(nodes_dict.keys())
coords = np.array([[nodes_dict[nid]["lat"], nodes_dict[nid]["lon"]] for nid in all_node_ids])

if len(all_node_ids) >= 2:
    n_neighbors = min(K_TRUCK + 1, len(all_node_ids))
    nn = NearestNeighbors(n_neighbors=n_neighbors, metric="haversine")
    nn.fit(np.radians(coords))
    dists, idxs = nn.kneighbors(np.radians(coords))

    for i, src_nid in enumerate(all_node_ids):
        src = nodes_dict[src_nid]

        for j in range(1, n_neighbors):
            tgt_idx = idxs[i][j]
            tgt_nid = all_node_ids[tgt_idx]

            if src_nid == tgt_nid:
                continue

            tgt = nodes_dict[tgt_nid]

            feasible, road_km = is_truck_feasible(
                src["name"], tgt["name"],
                src["country"], tgt["country"],
                src["lat"], src["lon"],
                tgt["lat"], tgt["lon"]
            )

            if not feasible:
                continue

            if (src_nid, tgt_nid, "Truck") in existing_edges:
                continue

            truck_days = road_km / (TRUCK_SPEED_KMPH * 24.0)

            edges_list.append({
                "source": src_nid,
                "target": tgt_nid,
                "features": [
                    float(road_km),
                    0.0,
                    0.0, 1.0,
                    0.0, 1.0,
                    0.0, 1.0,
                    float(truck_days),
                    0.0
                ],
                "weight": float(truck_days),
                "mode": "Truck",
                "category": "Synthetic",
                "cross_border": 1.0 if src["country"] != tgt["country"] else 0.0,
                "source_country": src["country"],
                "target_country": tgt["country"]
            })

            existing_edges.add((src_nid, tgt_nid, "Truck"))

print("✅ Truck backbone fixed (no island leakage).")

# ============================================================
# 8) SYNTHETIC AIR BACKBONE
# ============================================================
print("✈️ Building air backbone...")

airport_city_ids = [nid for nid, n in nodes_dict.items() if (n["name"] in HAS_AIRPORT or n["is_tier_1"])]
airport_coords = np.array([[nodes_dict[nid]["lat"], nodes_dict[nid]["lon"]] for nid in airport_city_ids], dtype=float)

if len(airport_city_ids) >= 2:
    n_neighbors = min(K_AIR + 1, len(airport_city_ids))
    nn_air = NearestNeighbors(n_neighbors=n_neighbors, metric="haversine")
    nn_air.fit(np.radians(airport_coords))
    dists_air, idxs_air = nn_air.kneighbors(np.radians(airport_coords))

    for i, src_nid in enumerate(airport_city_ids):
        for j in range(1, n_neighbors):
            tgt_idx = idxs_air[i][j]
            tgt_nid = airport_city_ids[tgt_idx]

            if src_nid == tgt_nid:
                continue

            src = nodes_dict[src_nid]
            tgt = nodes_dict[tgt_nid]
            geo_km = float(dists_air[i][j] * 6371.0)

            if geo_km < AIR_MIN_DISTANCE_KM:
                continue

            if (src_nid, tgt_nid, "Air") in existing_edges:
                continue

            air_days = (geo_km / (AIR_SPEED_KMPH * 24.0)) + 0.5

            edges_list.append({
                "source": src_nid,
                "target": tgt_nid,
                "features": [
                    float(geo_km),
                    1.0,
                    0.0, 1.0,
                    0.0, 1.0,
                    0.0, 1.0,
                    float(air_days),
                    2.0
                ],
                "weight": float(air_days),
                "mode": "Air",
                "category": "Synthetic",
                "cross_border": 1.0 if src["country"] != tgt["country"] else 0.0,
                "source_country": src["country"],
                "target_country": tgt["country"]
            })
            existing_edges.add((src_nid, tgt_nid, "Air"))

print("✅ Air backbone done.")

# ============================================================
# 9) SYNTHETIC OCEAN BACKBONE
# ============================================================
print("🚢 Building ocean backbone...")

seaport_city_ids = [nid for nid, n in nodes_dict.items() if (n["name"] in HAS_SEAPORT or n["is_tier_1"])]
seaport_coords = np.array([[nodes_dict[nid]["lat"], nodes_dict[nid]["lon"]] for nid in seaport_city_ids], dtype=float)

if len(seaport_city_ids) >= 2:
    n_neighbors = min(K_OCEAN + 1, len(seaport_city_ids))
    nn_sea = NearestNeighbors(n_neighbors=n_neighbors, metric="haversine")
    nn_sea.fit(np.radians(seaport_coords))
    dists_sea, idxs_sea = nn_sea.kneighbors(np.radians(seaport_coords))

    for i, src_nid in enumerate(seaport_city_ids):
        src = nodes_dict[src_nid]
        src_region = get_global_region(src["lat"], src["lon"])

        for j in range(1, n_neighbors):
            tgt_idx = idxs_sea[i][j]
            tgt_nid = seaport_city_ids[tgt_idx]

            if src_nid == tgt_nid:
                continue

            tgt = nodes_dict[tgt_nid]
            tgt_region = get_global_region(tgt["lat"], tgt["lon"])

            geo_km = float(dists_sea[i][j] * 6371.0)

            # Ocean should be long-haul and preferably interregional
            if geo_km < OCEAN_MIN_DISTANCE_KM:
                continue
            if src_region == tgt_region:
                continue

            if (src_nid, tgt_nid, "Ocean") in existing_edges:
                continue

            ocean_days = (geo_km / (OCEAN_SPEED_KMPH * 24.0)) + 2.0

            edges_list.append({
                "source": src_nid,
                "target": tgt_nid,
                "features": [
                    float(geo_km),
                    1.0,
                    0.0, 1.0,
                    0.0, 1.0,
                    0.0, 1.0,
                    float(ocean_days),
                    1.0
                ],
                "weight": float(ocean_days),
                "mode": "Ocean",
                "category": "Synthetic",
                "cross_border": 1.0 if src["country"] != tgt["country"] else 0.0,
                "source_country": src["country"],
                "target_country": tgt["country"]
            })
            existing_edges.add((src_nid, tgt_nid, "Ocean"))

print("✅ Ocean backbone done.")

# ============================================================
# 10) EXPORT
# ============================================================
print("💾 Saving JSON outputs...")

with open("nodes.json", "w", encoding="utf-8") as f:
    json.dump(list(nodes_dict.values()), f, indent=2, ensure_ascii=False)

with open("edges.json", "w", encoding="utf-8") as f:
    json.dump(edges_list, f, indent=2, ensure_ascii=False)

# Summary
mode_counts = Counter([e["mode"] for e in edges_list])
print("📈 Edge mode counts:", dict(mode_counts))
print(f"✅ Pipeline complete: {len(nodes_dict)} nodes, {len(edges_list)} edges.")