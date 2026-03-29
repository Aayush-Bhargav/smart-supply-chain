import json
import torch
import joblib
import numpy as np
import networkx as nx
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from torch.nn import Linear, Sequential, ReLU
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv

print("🚀 Waking up the Chaos Engine...")

# ==========================================
# 1. DEFINE THE MODEL ARCHITECTURE
# ==========================================
class SupplyChainSAGE(torch.nn.Module):
    def __init__(self, node_in_dim, edge_in_dim, hidden_dim):
        super(SupplyChainSAGE, self).__init__()
        self.conv1 = SAGEConv(node_in_dim, hidden_dim)
        self.conv2 = SAGEConv(hidden_dim, hidden_dim)
        
        concat_dim = (hidden_dim * 2) + edge_in_dim
        self.edge_predictor = Sequential(
            Linear(concat_dim, hidden_dim),
            ReLU(),
            Linear(hidden_dim, hidden_dim // 2),
            ReLU(),
            Linear(hidden_dim // 2, 1)
        )

    def forward(self, x, edge_index, edge_attr, query_edge_indices):
        h = self.conv1(x, edge_index)
        h = F.relu(h)
        h = self.conv2(h, edge_index)
        
        src_nodes = query_edge_indices[0]
        tgt_nodes = query_edge_indices[1]
        
        h_src = h[src_nodes]
        h_tgt = h[tgt_nodes]
        
        edge_inputs = torch.cat([h_src, h_tgt, edge_attr], dim=1)
        return self.edge_predictor(edge_inputs)

# ==========================================
# 2. LOAD ASSETS & BUILD AI-POWERED ROUTER
# ==========================================
G = nx.DiGraph()
city_to_id = {}
id_to_city = {}
global_raw_features = []

try:
    node_scaler = joblib.load("node_scaler.pkl")
    edge_scaler = joblib.load("edge_scaler.pkl")
except Exception as e:
    print(f"⚠️ Warning: Failed to load scalers. Error: {e}")

def build_networkx_graph():
    """Builds the live routing graph using GraphSAGE predictions."""
    global G, city_to_id, id_to_city, x_tensor, edge_index_tensor, edge_attr_tensor, model, global_raw_features
    
    G.clear()
    with open("nodes.json", "r") as f:
        nodes_data = json.load(f)
    with open("edges.json", "r") as f:
        edges_data = json.load(f)

    # Build Mappings
    city_to_id = {node["name"]: node["node_id"] for node in nodes_data}
    id_to_city = {node["node_id"]: node["name"] for node in nodes_data}
    nodes_data.sort(key=lambda x: x["node_id"])

    # Extract Features for PyTorch
    raw_edge_features = []
    edge_index_list = []
    valid_edges = []
    
    for edge in edges_data:
        if edge["weight"] < 900.0:  # Skip restricted/impossible routes
            global_raw_features.append(edge["features"]) # Save this globally!
            raw_edge_features.append(edge["features"])
            edge_index_list.append([edge["source"], edge["target"]])
            valid_edges.append(edge)

    # Reconstruct PyG Tensors
    x_raw = [node["features"] for node in nodes_data]
    x_tensor = torch.tensor(node_scaler.transform(x_raw), dtype=torch.float)
    
    edge_attr_scaled = edge_scaler.transform(raw_edge_features)
    edge_attr_tensor = torch.tensor(edge_attr_scaled, dtype=torch.float)
    
    edge_index_tensor = torch.tensor(edge_index_list, dtype=torch.long).t().contiguous()

    # Load Model Weights
    hidden_size = 64
    model = SupplyChainSAGE(
        node_in_dim=x_tensor.shape[1], 
        edge_in_dim=edge_scaler.n_features_in_, 
        hidden_dim=hidden_size
    )
    model.load_state_dict(torch.load("supply_chain_graphsage.pth", weights_only=True))
    model.eval()

    # ========================================================
    # THE MAGIC: AI BATCH PREDICTION FOR NETWORKX INITIALIZATION
    # ========================================================
    print("🧠 Running AI Predictions to initialize NetworkX...")
    with torch.no_grad():
        # Ask GraphSAGE to predict the weight for EVERY edge simultaneously
        predictions = model(x_tensor, edge_index_tensor, edge_attr_tensor, edge_index_tensor)
        predictions = predictions.view(-1).numpy() # Flatten to 1D array

    # Build the NetworkX graph using the AI's predictions
    for node in nodes_data:
        G.add_node(node["node_id"], **node)

    for i, edge in enumerate(valid_edges):
        predicted_days = float(predictions[i])
        predicted_days = max(0.1, predicted_days) # Prevent negative time anomalies
        
        G.add_edge(
            edge["source"], 
            edge["target"], 
            weight=predicted_days,              # NetworkX uses THIS for Dijkstra
            base_weight=predicted_days,         # Saved baseline for resetting chaos
            historical_weight=edge["weight"],   # Kept just for reference
            mode=edge["mode"],
            category=edge["category"]
        )
        
    print("✅ NetworkX Router built and powered by GraphSAGE!")

try:
    build_networkx_graph()
except Exception as e:
    print(f"⚠️ Warning: Failed to load graph data. Error: {e}")

# ==========================================
# 3. FASTAPI SETUP & ENDPOINTS
# ==========================================
app = FastAPI(title="Supply Chain Chaos Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RouteRequest(BaseModel):
    source_city: str
    target_city: str
    priority_level: float = 0.0 # 0.0 = Standard, 3.0 = Same Day Emergency

class ChaosQuery(BaseModel):
    disrupted_city: str
    weather_event: str 
    delay_multiplier: float 

@app.get("/")
def health_check():
    return {"status": "Chaos Engine Backend is live!", "nodes": G.number_of_nodes(), "edges": G.number_of_edges()}

@app.post("/find_route")
def find_route(query: RouteRequest):
    """Finds the smartest AI-optimized path, adjusting for the user's priority level."""
    if query.source_city not in city_to_id or query.target_city not in city_to_id:
        raise HTTPException(status_code=404, detail="City not found.")
        
    src_id = city_to_id[query.source_city]
    tgt_id = city_to_id[query.target_city]

    # 1. DYNAMIC AI RE-PREDICTION
    # We take the global features and override the shipping mode (the 10th item in the array)
    modified_features = [feat.copy() for feat in global_raw_features]
    for feat in modified_features:
        feat[9] = query.priority_level # Override with the user's requested priority!

    # Scale and convert to Tensor
    scaled_features = edge_scaler.transform(modified_features)
    new_edge_attr = torch.tensor(scaled_features, dtype=torch.float)

    # Ask the AI to re-evaluate the entire global supply chain in 10 milliseconds
    with torch.no_grad():
        new_predictions = model(x_tensor, edge_index_tensor, new_edge_attr, edge_index_tensor)
        new_predictions = new_predictions.view(-1).numpy()

    # Update the NetworkX Map with the newly predicted speeds
    for i, (u, v) in enumerate(edge_index_tensor.t().numpy()):
        # Only update if the route hasn't been destroyed by weather chaos
        if not G[u][v].get("disrupted", False):
            G[u][v]["weight"] = max(0.1, float(new_predictions[i]))

    # 2. RUN THE ROUTER
    try:
        path_nodes = nx.shortest_path(G, source=src_id, target=tgt_id, weight="weight")
        total_time = nx.shortest_path_length(G, source=src_id, target=tgt_id, weight="weight")
        
        route_details = []
        for i in range(len(path_nodes)-1):
            u = path_nodes[i]
            v = path_nodes[i+1]
            edge_data = G[u][v]
            route_details.append({
                "from": id_to_city[u],
                "to": id_to_city[v],
                "mode": edge_data["mode"],
                "days": round(edge_data["weight"], 2),
                "disrupted": edge_data.get("disrupted", False)
            })

        return {
            "source": query.source_city,
            "target": query.target_city,
            "priority_level_used": query.priority_level,
            "total_transit_days": round(total_time, 2),
            "hops": len(route_details),
            "route": route_details
        }
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="No physical path exists between these cities.")

@app.post("/simulate_chaos")
def simulate_chaos(query: ChaosQuery):
    """Injects a weather formula disruption into the network."""
    if query.disrupted_city not in city_to_id:
        raise HTTPException(status_code=404, detail="City not found.")
        
    city_id = city_to_id[query.disrupted_city]
    impacted_routes = 0

    # Apply the weather formula penalty to any route touching this city
    for u, v, data in G.edges(data=True):
        if u == city_id or v == city_id:
            base = data["base_weight"]
            new_weight = base * query.delay_multiplier
            
            G[u][v]["weight"] = new_weight
            G[u][v]["disrupted"] = True
            G[u][v]["disruption_reason"] = query.weather_event
            impacted_routes += 1

    return {
        "status": "Chaos successfully injected.",
        "disrupted_city": query.disrupted_city,
        "event": query.weather_event,
        "impacted_routes": impacted_routes
    }

@app.post("/reset_graph")
def reset_graph():
    """Clears all disruptions and resets the graph to AI baseline conditions."""
    for u, v, data in G.edges(data=True):
        G[u][v]["weight"] = data["base_weight"]
        G[u][v]["disrupted"] = False
        G[u][v]["disruption_reason"] = None
    return {"status": "Graph reset to optimal baseline conditions."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)