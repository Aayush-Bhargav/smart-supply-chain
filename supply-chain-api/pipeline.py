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
AIR_RESTRICTED_GOODS = {"Hazardous", "Cleats"}
SHIP_RESTRICTED_GOODS = {"Perishables", "Fresh Produce", "Dairy"}

# Changed from a Dictionary to a Set. 
# We use this purely to grant these cities "Air Freight" routing privileges.
TIER_1_HUBS = {
    "Los Angeles", "New York City", "Chicago", "Miami", "Caguas", 
    "London", "Paris", "Tokyo", "Bengaluru", "Delhi", "Santo Domingo", "Mexico City"
}

# ==========================================
# 2. GEOCODING CACHE SETUP
# ==========================================
# We use a custom user_agent to comply with OpenStreetMap's terms of service
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
    # 1. Check if we already looked it up previously
    if city_name in coord_cache:
        return tuple(coord_cache[city_name])

    # 2. If not, make the API Call
    print(f"   📡 API Call: Geocoding -> {city_name}...")
    try:
        # CRITICAL: 1.2 second delay so OpenStreetMap doesn't ban our IP
        time.sleep(1.2) 
        location = geolocator.geocode(city_name, timeout=10)
        
        if location:
            coords = (location.latitude, location.longitude)
            coord_cache[city_name] = coords
            return coords
        else:
            print(f"   ⚠️ Warning: Could not find '{city_name}'. Defaulting to deterministic fallback.")
            # Deterministic safe fallback (Roughly Central US) so it doesn't end up in the ocean
            np.random.seed(abs(hash(city_name)) % (2**32))
            coords = (np.random.uniform(30, 45), np.random.uniform(-110, -80))
            coord_cache[city_name] = coords
            return coords
            
    except Exception as e:
        print(f"   ❌ Error geocoding {city_name}: {e}")
        # Geographic center of US fallback on hard crash
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

# Cyclical Encoding for Time
df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12.0)
df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12.0)
df['day_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7.0)
df['day_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7.0)
df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24.0)
df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24.0)

# ==========================================
# 5. BUILDING THE NODES
# ==========================================
print("🏙️ Building City Nodes and resolving coordinates...")
nodes_dict = {}
node_id_counter = 0
city_to_id = {}

unique_cities = list(set(df['Customer City'].unique()).union(set(df['Order City'].unique())))

for city in unique_cities:
    city_to_id[city] = node_id_counter
    city_data = df[df['Customer City'] == city]
    
    avg_vol = float(city_data['Sales'].mean()) if not city_data.empty else 50.0
    avg_profit = float(city_data['Benefit per order'].mean()) if not city_data.empty else 10.0
    dom_cat = float(city_data['Category Id'].mode()[0]) if not city_data.empty else 0.0
    
    # We now fetch coordinates for ALL cities (Target and Source) dynamically if needed
    # Note: If it's a Customer City, the dataset usually has Lat/Lon. If it's an Order City, we API it.
    if not city_data.empty and pd.notna(city_data.iloc[0]['Latitude']):
        lat, lon = city_data.iloc[0]['Latitude'], city_data.iloc[0]['Longitude']
    else:
        lat, lon = get_destination_coords(city)

    nodes_dict[node_id_counter] = {
        "node_id": node_id_counter,
        "name": city,
        "lat": lat,
        "lon": lon,
        "is_tier_1": city in TIER_1_HUBS,
        "features": [avg_vol, avg_profit, dom_cat]
    }
    node_id_counter += 1

# Save the cache immediately after node generation in case the script crashes later
with open(CACHE_FILE, "w") as f:
    json.dump(coord_cache, f, indent=2)

# ==========================================
# 6. BUILDING THE EDGES
# ==========================================
print("🔗 Generating Edge Features and Rerouting Backbone...")
edges_list = []

# --- A. Historical Edges ---
for _, row in df.iterrows():
    source_id = city_to_id[row['Customer City']]
    target_id = city_to_id[row['Order City']]
    
    is_cross_border = 1.0 if row['Customer Country'] != row['Order Country'] else 0.0
    dist_km = calculate_haversine(nodes_dict[source_id]['lat'], nodes_dict[source_id]['lon'],
                                  nodes_dict[target_id]['lat'], nodes_dict[target_id]['lon'])
    
    mode_map = {"Standard Class": 0.0, "Second Class": 1.0, "First Class": 2.0, "Same Day": 3.0}
    raw_mode = row['Shipping Mode']
    mode_val = mode_map.get(raw_mode, 0.0)
    
    # Grab the actual transit time from the dataset
    actual_days = float(row['Days for shipping (real)'])

    # NEW: Deduce the physical vehicle using TIME, DISTANCE, and GEOGRAPHY
    source_lat = nodes_dict[source_id]['lat']
    source_lon = nodes_dict[source_id]['lon']
    target_lat = nodes_dict[target_id]['lat']
    target_lon = nodes_dict[target_id]['lon']
    
    region_source = get_global_region(source_lat, source_lon)
    region_target = get_global_region(target_lat, target_lon)
    
    if region_source != region_target:
        # Cross-Continent Route
        if actual_days < 10: 
            # If it crosses the globe in under 10 days, it HAS to be Air Freight
            physical_mode = "Air"
        else:
            # If it takes 10+ days to cross the globe, it's Ocean Freight
            physical_mode = "Ocean"
    else:
        # Same-Continent Route
        if dist_km > 1500 and actual_days < 3:
            # Over 1500km in under 3 days is Domestic Air (e.g., NY to LA overnight)
            physical_mode = "Air"
        else:
            # Otherwise, it's a Truck/Rail
            physical_mode = "Truck"

    is_air_restricted = row['Category Name'] in AIR_RESTRICTED_GOODS
    is_ship_restricted = row['Category Name'] in SHIP_RESTRICTED_GOODS

    final_weight = actual_days
    
    # Penalize impossible routes for future AI pathfinding
    if physical_mode == "Air" and is_air_restricted:
        final_weight = 999.0 
    if physical_mode == "Ocean" and is_ship_restricted:
        final_weight = 999.0 

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
        "category": row['Category Name']
    })

# --- B. Synthetic Hub-to-Hub Backbone ---
print("🌐 Generating Multi-Modal Synthetic Backbone...")
warehouse_names = df['Customer City'].unique()
warehouse_coords = np.array([[nodes_dict[city_to_id[w]]['lat'], nodes_dict[city_to_id[w]]['lon']] for w in warehouse_names])

if len(warehouse_coords) > 5:
    knn = NearestNeighbors(n_neighbors=5, metric='haversine')
    knn.fit(np.radians(warehouse_coords))
    distances, indices = knn.kneighbors(np.radians(warehouse_coords))

    for i, src_idx in enumerate(indices):
        src_city = warehouse_names[i]
        src_id = city_to_id[src_city]
        
        for j in range(1, 5): 
            tgt_city = warehouse_names[src_idx[j]]
            tgt_id = city_to_id[tgt_city]
            dist_km = distances[i][j] * 6371.0
            
            # Ground Edge
            truck_dist = dist_km * 1.25
            truck_days = truck_dist / (80 * 24)
            edges_list.append({
                "source": src_id,
                "target": tgt_id,
                "features": [truck_dist, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, truck_days, 0.0],
                "weight": truck_days,
                "mode": "Ground_Synthetic",
                "category": "All"
            })
            
            # Air Edge
            if dist_km > 500 and (src_city in TIER_1_HUBS) and (tgt_city in TIER_1_HUBS):
                air_dist = dist_km * 1.05
                air_days = (air_dist / (800 * 24)) + 0.5
                edges_list.append({
                    "source": src_id,
                    "target": tgt_id,
                    "features": [air_dist, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, air_days, 2.0],
                    "weight": air_days,
                    "mode": "Air_Synthetic",
                    "category": "All"
                })

# ==========================================
# 7. EXPORT TO JSON
# ==========================================
print("💾 Saving Output JSONs...")
with open("nodes.json", "w") as f:
    json.dump(list(nodes_dict.values()), f, indent=2)

with open("edges.json", "w") as f:
    json.dump(edges_list, f, indent=2)

print(f"✅ Pipeline Complete! Created {len(nodes_dict)} nodes and {len(edges_list)} edges.")