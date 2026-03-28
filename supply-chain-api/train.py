import json
import torch
import joblib
import numpy as np
import torch.nn.functional as F
from torch.nn import Linear, Sequential, ReLU
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

print("🧠 Initializing GraphSAGE Edge Regression Pipeline...")

# ==========================================
# 1. LOAD AND PREPARE DATA
# ==========================================
print("📂 Loading graph data...")
with open("nodes.json", "r") as f:
    nodes_data = json.load(f)
with open("edges.json", "r") as f:
    edges_data = json.load(f)

# --- Process Nodes ---
# Ensure nodes are sorted by node_id so the index matches the tensor
nodes_data.sort(key=lambda x: x["node_id"])
x_raw = [node["features"] for node in nodes_data]

# Scale Node Features (Volume, Profit, Category)
node_scaler = StandardScaler()
x_scaled = node_scaler.fit_transform(x_raw)
x_tensor = torch.tensor(x_scaled, dtype=torch.float)

# --- Process Edges ---
edge_index_list = []
edge_attr_raw = []
y_raw = []

for edge in edges_data:
    # Filter out the 999.0 penalty edges so they don't skew the training math
    # The AI doesn't need to learn "impossible", we already enforce that.
    if edge["weight"] < 900.0:
        edge_index_list.append([edge["source"], edge["target"]])
        edge_attr_raw.append(edge["features"])
        y_raw.append(edge["weight"])

# Convert to Tensors
edge_index_tensor = torch.tensor(edge_index_list, dtype=torch.long).t().contiguous()

# Scale Edge Features (Distance, Time embeddings, etc.)
edge_scaler = StandardScaler()
edge_attr_scaled = edge_scaler.fit_transform(edge_attr_raw)
edge_attr_tensor = torch.tensor(edge_attr_scaled, dtype=torch.float)

# Target Variable (Transit Time in Days)
y_tensor = torch.tensor(y_raw, dtype=torch.float).view(-1, 1)

# Create the PyTorch Geometric Data Object
data = Data(x=x_tensor, edge_index=edge_index_tensor, edge_attr=edge_attr_tensor, y=y_tensor)
print(f"✅ Graph built: {data.num_nodes} nodes, {data.num_edges} valid edges.")

# --- Train/Test Split (Edge Level) ---
# We split the indices of the edges to evaluate our model
indices = np.arange(data.num_edges)
train_idx, test_idx = train_test_split(indices, test_size=0.2, random_state=42)

train_idx = torch.tensor(train_idx, dtype=torch.long)
test_idx = torch.tensor(test_idx, dtype=torch.long)

# ==========================================
# 2. DEFINE THE NEURAL NETWORK
# ==========================================
class SupplyChainSAGE(torch.nn.Module):
    def __init__(self, node_in_dim, edge_in_dim, hidden_dim):
        super(SupplyChainSAGE, self).__init__()
        
        # 1. GraphSAGE Layers for Node Embeddings
        self.conv1 = SAGEConv(node_in_dim, hidden_dim)
        self.conv2 = SAGEConv(hidden_dim, hidden_dim)
        
        # 2. Edge Regression Head 
        # Concatenates: Source Node (hidden_dim) + Target Node (hidden_dim) + Edge Attr (edge_in_dim)
        concat_dim = (hidden_dim * 2) + edge_in_dim
        
        self.edge_predictor = Sequential(
            Linear(concat_dim, hidden_dim),
            ReLU(),
            Linear(hidden_dim, hidden_dim // 2),
            ReLU(),
            Linear(hidden_dim // 2, 1) # Predicts 1 scalar: Total Transit Time
        )

    def forward(self, x, edge_index, edge_attr, query_edge_indices):
        # Step A: Get Node Embeddings via GraphSAGE
        # This gives every city an embedding based on its neighbors
        h = self.conv1(x, edge_index)
        h = F.relu(h)
        h = self.conv2(h, edge_index)
        
        # Step B: Predict Transit Time for specific edges
        src_nodes = query_edge_indices[0]
        tgt_nodes = query_edge_indices[1]
        
        # Grab the embeddings for the requested source and target cities
        h_src = h[src_nodes]
        h_tgt = h[tgt_nodes]
        
        # Concatenate Source + Target + Physical Edge Features
        edge_inputs = torch.cat([h_src, h_tgt, edge_attr], dim=1)
        
        # Pass through the MLP to get the final predicted days
        return self.edge_predictor(edge_inputs)

# Initialize Model
hidden_size = 64
model = SupplyChainSAGE(
    node_in_dim=data.num_node_features, 
    edge_in_dim=data.num_edge_features, 
    hidden_dim=hidden_size
)

optimizer = torch.optim.Adam(model.parameters(), lr=0.005)
criterion = torch.nn.MSELoss() # Mean Squared Error (Standard for regression)

# ==========================================
# 3. TRAINING LOOP
# ==========================================
print("\n🚀 Starting Training...")
epochs = 400

for epoch in range(1, epochs + 1):
    model.train()
    optimizer.zero_grad()
    
    # We pass the full graph structure (edge_index) so GraphSAGE can build embeddings,
    # but we only ask it to predict the weights for the TRAINING edges.
    train_edges = data.edge_index[:, train_idx]
    train_attrs = data.edge_attr[train_idx]
    
    out = model(data.x, data.edge_index, train_attrs, train_edges)
    
    loss = criterion(out, data.y[train_idx])
    loss.backward()
    optimizer.step()
    
    # Evaluate on Test Set every 20 epochs
    if epoch % 20 == 0 or epoch == 1:
        model.eval()
        with torch.no_grad():
            test_edges = data.edge_index[:, test_idx]
            test_attrs = data.edge_attr[test_idx]
            test_out = model(data.x, data.edge_index, test_attrs, test_edges)
            test_loss = criterion(test_out, data.y[test_idx])
            
            # MAE (Mean Absolute Error) is easier to read. 
            # E.g., MAE of 1.5 means we are off by 1.5 days on average.
            test_mae = torch.mean(torch.abs(test_out - data.y[test_idx]))
            
        print(f"Epoch {epoch:03d} | Train Loss (MSE): {loss.item():.4f} | Test Loss: {test_loss.item():.4f} | Test MAE: {test_mae.item():.4f} days")

print("\n✅ Training Complete!")
# Save the model for future inference
torch.save(model.state_dict(), "supply_chain_graphsage.pth")
print("💾 Model saved as 'supply_chain_graphsage.pth'")

joblib.dump(node_scaler, "node_scaler.pkl")
joblib.dump(edge_scaler, "edge_scaler.pkl")
print("💾 Scalers saved as 'node_scaler.pkl' and 'edge_scaler.pkl'")