import pandas as pd
import numpy as np
import json
import math
import os
import time
from datetime import datetime
from sklearn.neighbors import NearestNeighbors
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut

print("🚀 Starting Supply Chain Data Pipeline...")

# ==========================================
# 1. LOGISTICS CONSTRAINTS & CONFIGURATION
# ==========================================
# Penalizing restricted items for specific transport modes
AIR_RESTRICTED_GOODS = {"Hazardous", "Cleats"}
SHIP_RESTRICTED_GOODS = {"Perishables", "Fresh Produce", "Dairy"}

# The Absolute Global Mega-Hubs
TIER_1_HUBS = {
    "New York City", "Los Angeles", "London", "Paris", "Tokyo", 
    "Mumbai", "Chicago", "Miami", "Shanghái", "Singapur", 
    "Sydney", "São Paulo", "Delhi", "Frankfurt", "Pekín", "Kowloon"
}

# Major Seaports extracted from your specific dataset
HAS_SEAPORT = TIER_1_HUBS.union({
    "Rotterdam", "Busan", "Durban", "Lagos", "Houston", "Dakar", 
    "Montevideo", "Dar es Salaam", "Porto Alegre", "Tampa", "Naples", 
    "Barcelona", "Cagliari", "Luanda", "Xiamen", "Bristol", "Athens", 
    "Auckland", "Casablanca", "Surabaya", "Adelaide", "Veracruz", 
    "Genoa", "Recife", "Plymouth", "Jacksonville", "Cape Town", 
    "Valencia", "Maputo", "Nice", "Kuwait City", "Glasgow", "Lisbon", 
    "Guangzhou", "Bordeaux", "Brisbane", "Melbourne", "Cienfuegos", 
    "Haifa", "Port Said", "Dalian", "Cairns", "Hobart", "Callao", "Antalya"
})

# Major Regional/International Airports extracted from your dataset
HAS_AIRPORT = TIER_1_HUBS.union({
    "Honolulu", "Indianapolis", "Las Vegas", "Washington", "Manchester", 
    "Memphis", "New Orleans", "Bogotá", "Atlanta", "Charlotte", 
    "Salt Lake City", "Cincinnati", "Dallas", "Denver", "Seattle", 
    "Minneapolis", "Detroit", "Orlando", "Boston", "San Diego", 
    "Phoenix", "Philadelphia", "Baltimore", "Guatemala City",
    "San Salvador", "San Jose", "Sacramento", "Austin", "Raleigh",
    "Edmonton", "Calgary", "Vancouver", "Ottawa", "Montréal",
    "Munich", "Berlín", "Madrid", "Rome", "Milan", "Viena",
    "Estocolmo", "Oslo", "Helsinki", "Copenhagen", "Budapest",
    "Warsaw", "Praga", "Cairo", "Nairobi", "Johannesburg",
    "Bangkok", "Yakarta", "Manila", "Taipei", "Seúl"
})

# ==========================================
# 2. GEOCODING CACHE SETUP
# ==========================================
geolocator = Nominatim(user_agent="smart_supply_chain_hackathon_v1")
CACHE_FILE = "city_coords_cache.json"

if os.path.exists(CACHE_FILE):
    print("📦 Loading existing geographic cache...")
    with open(CACHE_FILE, "r") as f:
        coord_cache = json.load(f)
else:
    print("🌍 No cache found. Creating new geographic cache...")
    coord_cache = {}

# ==========================================
# 3. CORE FUNCTIONS
# ==========================================
def calculate_haversine(lat1, lon1, lat2, lon2):
    """Calculates physical distance in kilometers."""
    R = 6371.0
    lat1_rad, lon1_rad = map(math.radians, [lat1, lon1])
    lat2_rad, lon2_rad = map(math.radians, [lat2, lon2])
    dlat, dlon = lat2_rad - lat1_rad, lon2_rad - lon1_rad
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def get_global_region(lat, lon):
    """A fast bounding-box check to group continents by longitude."""
    if lon < -30:
        return "Americas"
    elif lon > 100 and lat < -10:
        return "Oceania" # Australia/New Zealand
    else:
        return "Afro-Eurasia" # Europe, Africa, Asia
    
def get_destination_coords(city_name):
    """Fetches real coordinates using OpenStreetMap with local caching."""
    if city_name in coord_cache:
        return tuple(coord_cache[city_name])

    print(f"   📡 API Call: Geocoding -> {city_name}...")
    try:
        time.sleep(1.2) # Prevent API Ban
        location = geolocator.geocode(city_name, timeout=10)
        
        if location:
            coords = (location.latitude, location.longitude)
            coord_cache[city_name] = coords
            return coords
        else:
            print(f"   ⚠️ Warning: Could not find '{city_name}'. Defaulting to deterministic fallback.")
            np.random.seed(abs(hash(city_name)) % (2**32))
            coords = (np.random.uniform(30, 45), np.random.uniform(-110, -80))
            coord_cache[city_name] = coords
            return coords
            
    except Exception as e:
        print(f"   ❌ Error geocoding {city_name}: {e}")
        return (39.8283, -98.5795) 

# ==========================================
# 4. DATA INGESTION & CLEANING
# ==========================================
print("📊 Loading DataCo CSV (Processing 25,000 rows)...")
df = pd.read_csv("DataCoSupplyChainDataset.csv", encoding='latin1', nrows=25000)

cols_to_keep = [
    'Customer City', 'Customer Country', 'Latitude', 'Longitude', 
    'Order City', 'Order Country', 'order date (DateOrders)', 
    'Days for shipping (real)', 'Days for shipment (scheduled)', 
    'Shipping Mode', 'Category Name', 'Category Id', 'Sales', 'Benefit per order'
]
df = df[cols_to_keep].dropna()

# Extract Temporal Features
df['order_date'] = pd.to_datetime(df['order date (DateOrders)'])
df['month'] = df['order_date'].dt.month
df['day_of_week'] = df['order_date'].dt.dayofweek
df['hour'] = df['order_date'].dt.hour

# Cyclical Encoding for Time [cite: 2]
df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12.0)
df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12.0)
df['day_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7.0)
df['day_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7.0)
df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24.0)
df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24.0)

# ==========================================
# 5. BUILDING THE NODES (small addition: store country)
# ==========================================
print("🏙️ Building City Nodes and resolving coordinates...")

# City → Country map (cities are unique per country in this dataset)
city_to_country = {}
for _, row in df.iterrows():
    city_to_country[row['Customer City']] = row['Customer Country']
    city_to_country[row['Order City']] = row['Order Country']  # overwrite is fine

nodes_dict = {}
node_id_counter = 0
city_to_id = {}

unique_cities = list(set(df['Customer City'].unique()).union(set(df['Order City'].unique())))

for city in unique_cities:
    city_to_id[city] = node_id_counter
    city_data = df[df['Customer City'] == city]  # or Order City – doesn't matter
    avg_vol = float(city_data['Sales'].mean()) if not city_data.empty else 50.0
    avg_profit = float(city_data['Benefit per order'].mean()) if not city_data.empty else 10.0
    dom_cat = float(city_data['Category Id'].mode()[0]) if not city_data.empty else 0.0

    # Use dataset lat/lon if available, else geocode
    if not city_data.empty and pd.notna(city_data.iloc[0]['Latitude']):
        lat, lon = city_data.iloc[0]['Latitude'], city_data.iloc[0]['Longitude']
    else:
        lat, lon = get_destination_coords(city)

    nodes_dict[node_id_counter] = {
        "node_id": node_id_counter,
        "name": city,
        "country": city_to_country.get(city, "Unknown"),
        "lat": lat,
        "lon": lon,
        "is_tier_1": city in TIER_1_HUBS,
        "features": [avg_vol, avg_profit, dom_cat]
    }
    node_id_counter += 1

with open(CACHE_FILE, "w") as f:
    json.dump(coord_cache, f, indent=2)

# ==========================================
# 6. BUILDING THE EDGES ← REALISTIC PHYSICS ENGINE (v3)
# ==========================================
print("🔗 Generating Edge Features and Rerouting Backbone...")

# ────── NEW HELPERS (already present – keeping them) ──────
CARIBBEAN_ISLANDS = {
    "Puerto Rico", "Cuba", "Bahamas", "Jamaica", "Haiti", "Dominican Republic",
    "Trinidad and Tobago", "Barbados", "Saint Lucia", "Saint Vincent and the Grenadines"
}
KNOWN_LAND_BORDER_PAIRS = {
    frozenset({"United States", "Canada"}),
    frozenset({"United States", "Mexico"}),
    frozenset({"Canada", "Mexico"})
}

def is_truck_possible(country1: str, country2: str, dist_km: float) -> bool:
    """Realistic land-truck check – blocks all over-water international routes."""
    if country1 == country2:
        return True
    pair = frozenset({country1, country2})
    if pair in KNOWN_LAND_BORDER_PAIRS:
        return dist_km <= 1200
    if country1 in CARIBBEAN_ISLANDS or country2 in CARIBBEAN_ISLANDS:
        return False
    return dist_km <= 450

# ────── EDGE BUILDING STARTS HERE ──────
edges_list = []
existing_edges = set()

# --- A. Historical Edges (real orders) ---
for _, row in df.iterrows():
    source_id = city_to_id[row['Customer City']]
    target_id = city_to_id[row['Order City']]
    
    country1 = row['Customer Country']
    country2 = row['Order Country']
    is_cross_border = 1.0 if country1 != country2 else 0.0
    dist_km = calculate_haversine(
        nodes_dict[source_id]['lat'], nodes_dict[source_id]['lon'],
        nodes_dict[target_id]['lat'], nodes_dict[target_id]['lon']
    )
    actual_days = float(row['Days for shipping (real)'])

    # ==================== IMPROVED & REALISTIC TRANSPORT LOGIC ====================
    if country1 == country2:                                      # DOMESTIC
        # Much more aggressive Truck for domestic (most real freight is road)
        physical_mode = "Truck" if dist_km <= 3500 or actual_days >= 2.0 else "Air"

    elif is_truck_possible(country1, country2, dist_km):          # INTERNATIONAL land-border only
        physical_mode = "Truck" if dist_km <= 1200 else "Air"

    else:                                                         # INTERNATIONAL over water / far
        # Ocean ONLY if BOTH cities are in our major seaport list + slow enough
        is_port_to_port = (
            row['Customer City'] in HAS_SEAPORT and
            row['Order City'] in HAS_SEAPORT
        )
        if is_port_to_port and (actual_days > 6 or dist_km >= 2500):
            physical_mode = "Ocean"
        else:
            physical_mode = "Air"
    # ============================================================================

    # Restriction penalties (unchanged)
    is_air_restricted = row['Category Name'] in AIR_RESTRICTED_GOODS
    is_ship_restricted = row['Category Name'] in SHIP_RESTRICTED_GOODS
    final_weight = actual_days
    if physical_mode == "Air" and is_air_restricted:
        final_weight = 999.0
    if physical_mode == "Ocean" and is_ship_restricted:
        final_weight = 999.0

    mode_map = {"Standard Class": 0.0, "Second Class": 1.0, "First Class": 2.0, "Same Day": 3.0}
    mode_val = mode_map.get(row['Shipping Mode'], 0.0)

    features = [
        dist_km, is_cross_border,
        row['month_sin'], row['month_cos'],
        row['day_sin'], row['day_cos'],
        row['hour_sin'], row['hour_cos'],
        float(row['Days for shipment (scheduled)']),
        mode_val
    ]

    edges_list.append({
        "source": source_id,
        "target": target_id,
        "features": features,
        "weight": final_weight,
        "mode": physical_mode,
        "category": row['Category Name'],
        "cross_border": is_cross_border,
        "source_country": country1,
        "target_country": country2
    })
    existing_edges.add((source_id, target_id, physical_mode))

# Quick audit after historical edges
from collections import Counter
mode_counts = Counter(e["mode"] for e in edges_list)
print("=== EDGE MODE DISTRIBUTION (Historical only) ===")
print(mode_counts)
print(f"Total historical edges: {len(edges_list)}")

# --- B. Synthetic Hub-to-Hub Backbone (also tightened) ---
print("🌐 Generating Multi-Modal Synthetic Backbone...")
top_warehouses = df.groupby('Customer City')['Sales'].sum().nlargest(50).index.tolist()
valid_top_warehouses = [w for w in top_warehouses if w in city_to_id]

warehouse_coords = np.array([
    [nodes_dict[city_to_id[w]]['lat'], nodes_dict[city_to_id[w]]['lon']]
    for w in valid_top_warehouses
])

if len(warehouse_coords) > 5:
    knn = NearestNeighbors(n_neighbors=6, metric='haversine')
    knn.fit(np.radians(warehouse_coords))
    distances, indices = knn.kneighbors(np.radians(warehouse_coords))

    for i, src_idx in enumerate(indices):
        src_city = valid_top_warehouses[i]
        src_id = city_to_id[src_city]
        src_country = nodes_dict[src_id]['country']

        for j in range(1, 6):
            tgt_city = valid_top_warehouses[src_idx[j]]
            tgt_id = city_to_id[tgt_city]
            tgt_country = nodes_dict[tgt_id]['country']

            dist_km = distances[i][j] * 6371.0
            same_region = get_global_region(nodes_dict[src_id]['lat'], nodes_dict[src_id]['lon']) == \
                          get_global_region(nodes_dict[tgt_id]['lat'], nodes_dict[tgt_id]['lon'])

            # TRUCK: only realistic land corridors
            if is_truck_possible(src_country, tgt_country, dist_km) and dist_km <= 1000 and same_region:
                if (src_id, tgt_id, "Truck") not in existing_edges:
                    truck_dist = dist_km * 1.25
                    truck_days = truck_dist / (80 * 24)
                    edges_list.append({
                        "source": src_id, "target": tgt_id,
                        "features": [truck_dist, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, truck_days, 0.0],
                        "weight": truck_days, "mode": "Truck", "category": "Synthetic",
                        "cross_border": 1.0 if src_country != tgt_country else 0.0,
                        "source_country": src_country,
                        "target_country": tgt_country
                    })
                    existing_edges.add((src_id, tgt_id, "Truck"))

            # AIR & OCEAN gates (unchanged – they were already good)
            if dist_km > 500 and (src_city in HAS_AIRPORT) and (tgt_city in HAS_AIRPORT):
                if (src_id, tgt_id, "Air") not in existing_edges:
                    air_dist = dist_km * 1.05
                    air_days = (air_dist / (800 * 24)) + 0.5
                    edges_list.append({
                        "source": src_id, "target": tgt_id,
                        "features": [air_dist, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, air_days, 2.0],
                        "weight": air_days, "mode": "Air", "category": "Synthetic",
                        "cross_border": 1.0 if src_country != tgt_country else 0.0,
                        "source_country": src_country,
                        "target_country": tgt_country
                    })
                    existing_edges.add((src_id, tgt_id, "Air"))

            if dist_km > 1000 and (src_city in HAS_SEAPORT) and (tgt_city in HAS_SEAPORT) and not same_region:
                if (src_id, tgt_id, "Ocean") not in existing_edges:
                    ocean_dist = dist_km * 1.5
                    ocean_days = (ocean_dist / (40 * 24)) + 2.0
                    edges_list.append({
                        "source": src_id, "target": tgt_id,
                        "features": [ocean_dist, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, ocean_days, 1.0],
                        "weight": ocean_days, "mode": "Ocean", "category": "Synthetic",
                        "cross_border": 1.0 if src_country != tgt_country else 0.0,
                        "source_country": src_country,
                        "target_country": tgt_country
                    })
                    existing_edges.add((src_id, tgt_id, "Ocean"))

# ==========================================
# 7. EXPORT TO JSON
# ==========================================
print("💾 Saving Output JSONs...")
with open("nodes.json", "w") as f:
    json.dump(list(nodes_dict.values()), f, indent=2)

with open("edges.json", "w") as f:
    json.dump(edges_list, f, indent=2)

print(f"✅ Pipeline Complete! Created {len(nodes_dict)} nodes and {len(edges_list)} edges.")