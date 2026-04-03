import pandas as pd
import numpy as np
import json
import math
import os
import time
from geopy.geocoders import Nominatim

print("🚀 Building TRAINING graph (NO synthetic edges)...")

# ============================================================
# CACHE + GEOCODER
# ============================================================
CACHE_FILE = "city_coords_cache.json"
geolocator = Nominatim(user_agent="supply_chain")

if os.path.exists(CACHE_FILE):
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        coord_cache = json.load(f)
else:
    coord_cache = {}

# ============================================================
# LOAD DATA
# ============================================================
df = pd.read_csv("DataCoSupplyChainDataset.csv", encoding="latin1")

cols = [
    "Customer City", "Customer Country", "Latitude", "Longitude",
    "Order City", "Order Country", "order date (DateOrders)",
    "Days for shipping (real)", "Days for shipment (scheduled)",
    "Shipping Mode", "Category Name", "Category Id",
    "Order Item Quantity",
    "Sales", "Benefit per order"
]
df = df[cols].dropna().copy()

df["order_date"] = pd.to_datetime(df["order date (DateOrders)"], errors="coerce")
df = df.dropna(subset=["order_date"])

# ============================================================
# TIME FEATURES
# ============================================================
df["month_sin"] = np.sin(2 * np.pi * df["order_date"].dt.month / 12.0)
df["month_cos"] = np.cos(2 * np.pi * df["order_date"].dt.month / 12.0)
df["day_sin"] = np.sin(2 * np.pi * df["order_date"].dt.dayofweek / 7.0)
df["day_cos"] = np.cos(2 * np.pi * df["order_date"].dt.dayofweek / 7.0)
df["hour_sin"] = np.sin(2 * np.pi * df["order_date"].dt.hour / 24.0)
df["hour_cos"] = np.cos(2 * np.pi * df["order_date"].dt.hour / 24.0)

# ============================================================
# INFRASTRUCTURE SETS
# ============================================================
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

# ============================================================
# UTILS
# ============================================================
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def get_coords(city, country):
    cache_key = f"{city}"
    if cache_key in coord_cache:
        lat, lon = coord_cache[cache_key]
        return float(lat), float(lon)

    rows = df[df["Customer City"] == city]
    if not rows.empty and pd.notna(rows.iloc[0]["Latitude"]) and pd.notna(rows.iloc[0]["Longitude"]):
        lat = float(rows.iloc[0]["Latitude"])
        lon = float(rows.iloc[0]["Longitude"])
        coord_cache[cache_key] = [lat, lon]
        return lat, lon

    try:
        print(f"🌍 Geocoding {city}, {country}...")
        time.sleep(1)
        location = geolocator.geocode(f"{city}, {country}", timeout=10)
        if location:
            lat, lon = float(location.latitude), float(location.longitude)
            coord_cache[cache_key] = [lat, lon]
            return lat, lon
    except Exception:
        pass

    print(f"⚠️ Failed geocoding: {city}, {country}")
    return None, None

def infer_physical_mode(
    src_city, tgt_city,
    src_country, tgt_country,
    dist_km,
    actual_days
):
    src_air = src_city in HAS_AIRPORT
    tgt_air = tgt_city in HAS_AIRPORT
    src_sea = src_city in HAS_SEAPORT
    tgt_sea = tgt_city in HAS_SEAPORT

    same_country = src_country == tgt_country

    # Domestic, short-haul: usually truck
    if same_country and dist_km <= 900:
        return "Truck"

    # Domestic but unusually fast over a longer distance: likely air
    if same_country and dist_km > 900 and actual_days <= 2.5:
        return "Air"

    # Long international, slow shipment: likely ocean
    if dist_km >= 2000 and actual_days >= 5:
        return "Ocean"

    # International, faster shipment: likely air
    if dist_km >= 700 and actual_days <= 4:
        if src_air or tgt_air or not same_country:
            return "Air"

    # Cross-border short-haul truck cases
    if frozenset({src_country, tgt_country}) in KNOWN_LAND_BORDER_PAIRS and dist_km <= 1200:
        return "Truck"

    # Fallback
    if actual_days >= 5:
        return "Ocean"
    return "Air"

# ============================================================
# BUILD NODES
# ============================================================
city_to_id = {}
nodes_dict = {}
node_id = 0

cities = sorted(set(df["Customer City"].unique()).union(set(df["Order City"].unique())))

for city in cities:
    city_rows = df[(df["Customer City"] == city) | (df["Order City"] == city)]
    if city_rows.empty:
        continue

    country_counts = pd.concat([
        df.loc[df["Customer City"] == city, "Customer Country"],
        df.loc[df["Order City"] == city, "Order Country"]
    ]).dropna()

    country = country_counts.mode().iloc[0] if not country_counts.empty else "Unknown"

    lat, lon = get_coords(city, country)
    if lat is None or lon is None:
        continue

    city_to_id[city] = node_id

    avg_sales = float(city_rows["Sales"].mean()) if not city_rows.empty else 50.0
    avg_profit = float(city_rows["Benefit per order"].mean()) if not city_rows.empty else 10.0
    dom_cat = float(city_rows["Category Id"].mode().iloc[0]) if not city_rows.empty and not city_rows["Category Id"].mode().empty else 0.0

    nodes_dict[node_id] = {
        "node_id": node_id,
        "name": city,
        "country": country,
        "lat": lat,
        "lon": lon,
        "is_tier_1": False,
        "features": [avg_sales, avg_profit, dom_cat]
    }

    node_id += 1

# ============================================================
# BUILD EDGES
# ============================================================
edges = []
existing = set()

mode_map = {
    "Standard Class": 0.0,
    "Second Class": 1.0,
    "First Class": 2.0,
    "Same Day": 3.0
}

physical_mode_map = {
    "Truck": 0.0,
    "Air": 1.0,
    "Ocean": 2.0
}
unique_categories = sorted(df["Category Name"].unique())
cat_to_idx = {cat: i for i, cat in enumerate(unique_categories)}
NUM_CATEGORIES = len(unique_categories)
print(f"📦 Total categories: {NUM_CATEGORIES}")
with open("category_mapping.json", "w", encoding="utf-8") as f:
    json.dump(cat_to_idx, f, indent=2, ensure_ascii=False)
for _, row in df.iterrows():
    if row["Customer City"] not in city_to_id or row["Order City"] not in city_to_id:
        continue


   
    src = city_to_id[row["Customer City"]]
    tgt = city_to_id[row["Order City"]]

    src_node = nodes_dict[src]
    tgt_node = nodes_dict[tgt]

    dist = haversine(
        src_node["lat"], src_node["lon"],
        tgt_node["lat"], tgt_node["lon"]
    )

    physical_mode = infer_physical_mode(
        row["Customer City"],
        row["Order City"],
        row["Customer Country"],
        row["Order Country"],
        dist,
        float(row["Days for shipping (real)"])
    )

    key = (src, tgt, physical_mode)
    if key in existing:
        continue
    existing.add(key)

    cross_border = 1.0 if row["Customer Country"] != row["Order Country"] else 0.0
    quantity = float(row["Order Item Quantity"]) if pd.notna(row["Order Item Quantity"]) else 0.0
    cat_vec = [0.0] * NUM_CATEGORIES
    cat_idx = cat_to_idx.get(row["Category Name"], None)
    if cat_idx is not None:
        cat_vec[cat_idx] = 1.0
    # Feature order must match inference pipeline
    # [distance, cross_border, month_sin, month_cos, day_sin, day_cos, hour_sin, hour_cos,
    #  scheduled_days, shipping_mode_encoded, quantity, physical_mode_encoded]
    features = [
        float(dist),
        float(cross_border),
        float(row["month_sin"]),
        float(row["month_cos"]),
        float(row["day_sin"]),
        float(row["day_cos"]),
        float(row["hour_sin"]),
        float(row["hour_cos"]),
        float(row["Days for shipment (scheduled)"]) if pd.notna(row["Days for shipment (scheduled)"]) else 0.0,
        float(mode_map.get(row["Shipping Mode"], 0.0)),
        quantity,
        float(physical_mode_map.get(physical_mode, 1.0)),
        *cat_vec
    ]

    edges.append({
        "source": src,
        "target": tgt,
        "features": features,
        "weight": float(row["Days for shipping (real)"]),
        "mode": physical_mode,   # raw physical mode kept as field
        "category": row["Category Name"],
        "cross_border": cross_border,
        "source_country": row["Customer Country"],
        "target_country": row["Order Country"],
        "quantity": quantity
    })

# ============================================================
# SAVE CACHE
# ============================================================
with open(CACHE_FILE, "w", encoding="utf-8") as f:
    json.dump(coord_cache, f, indent=2, ensure_ascii=False)

# ============================================================
# SAVE GRAPH
# ============================================================
with open("nodes.json", "w", encoding="utf-8") as f:
    json.dump(list(nodes_dict.values()), f, indent=2, ensure_ascii=False)

with open("edges.json", "w", encoding="utf-8") as f:
    json.dump(edges, f, indent=2, ensure_ascii=False)

print("✅ Training graph ready (quantity + mode feature included)")
print(f"Nodes: {len(nodes_dict)}")
print(f"Edges: {len(edges)}")