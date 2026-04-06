import os

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
