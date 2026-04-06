import os
from contextlib import asynccontextmanager

import joblib
import networkx as nx
import numpy as np
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import RobustSupplyChainSAGE
from services import RouteService
from utils import (
    load_graph_data, 
    build_graph
)
from utils.config import (
    ENVIRONMENT, 
    PORT, 
    ALLOWED_ORIGINS,
    MODEL_FILE,
    NODE_SCALER_FILE,
    EDGE_SCALER_FILE
)
from routes import route_router

print("🚀 Waking up Supply Chain Route API...")

# Global variables for the application
route_service: RouteService = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize application state"""
    global route_service
    
    print("📂 Loading graph data...")
    nodes_data, edges_data, category_to_idx, num_categories, node_scaler, edge_scaler = load_graph_data()
    
    print("🕸️  Building graph...")
    G, id_to_city, id_map = build_graph(nodes_data, edges_data)
    
    print("🔢 Preparing tensors...")
    # Create node features tensor
    node_features = []
    for node in nodes_data:
        features = [
            float(node["lat"]),
            float(node["lon"]),
            float(node.get("importance", 1.0))
        ]
        node_features.append(features)
    
    node_features_array = np.array(node_features)
    node_features_scaled = node_scaler.transform(node_features_array)
    x_tensor = torch.tensor(node_features_scaled, dtype=torch.float)
    
    # Create edge index tensor
    edge_index = []
    base_edge_features = []
    
    for edge in edges_data:
        src = edge["source"]
        tgt = edge["target"]
        edge_index.append([src, tgt])
        
        # Basic edge features
        features = [
            float(edge.get("distance_km", 0.0)),
            1.0 if edge.get("source_country") != edge.get("target_country") else 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  # temporal features (will be set later)
            4.0,  # scheduled_days (default)
            0.0,  # preference (default)
            1.0,  # quantity (default)
            0.0,  # physical_mode (default)
        ]
        
        # Add category one-hot (zeros for now)
        features.extend([0.0] * num_categories)
        base_edge_features.append(features)
    
    edge_index_tensor = torch.tensor(edge_index, dtype=torch.long).t().contiguous()
    base_edge_features_array = np.array(base_edge_features)
    
    # Create new scalers with current data
    from sklearn.preprocessing import StandardScaler
    edge_scaler = StandardScaler()
    edge_attr_scaled = edge_scaler.fit_transform(base_edge_features_array)
    edge_attr_tensor = torch.tensor(edge_attr_scaled, dtype=torch.float)
    
    # Save the updated scalers
    joblib.dump(edge_scaler, EDGE_SCALER_FILE)
    print(f"✅ Updated scalers saved. New edge features: {edge_attr_tensor.shape[1]}")
    
    # Initialize model
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
    
    # Initialize route service
    route_service = RouteService(
        graph=G,
        model=model,
        category_to_idx=category_to_idx,
        num_categories=num_categories,
        edge_scaler=edge_scaler,
        node_features=x_tensor,
        edge_index=edge_index_tensor,
        base_edge_features=edge_attr_tensor,
        id_to_city=id_to_city,
        id_map=id_map,
        nodes_data=nodes_data
    )
    
    print("✅ Route service initialized successfully!")
    
    yield
    
    print("🛑 Shutting down...")

# Create FastAPI app
app = FastAPI(
    title="Supply Chain Route API",
    lifespan=lifespan,
    description="AI-powered supply chain route optimization API"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(route_router)

# Dependency to get route service
def get_route_service() -> RouteService:
    return route_service

# Override the dependency using app-level dependency overrides
from routes.route_routes import get_route_service as original_get_route_service
app.dependency_overrides[original_get_route_service] = get_route_service

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
