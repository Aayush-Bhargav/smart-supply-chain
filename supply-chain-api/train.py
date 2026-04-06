import json
import torch
import joblib
import numpy as np
import torch.nn.functional as F
from torch.nn import Linear, Sequential, GELU, BatchNorm1d, Dropout, LayerNorm
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score

# ==========================================
# 1. LOAD AND MAP DATA
# ==========================================
print("📂 Loading and verifying graph data...")
with open("nodes.json", "r") as f:
    nodes_data = json.load(f)
with open("edges.json", "r") as f:
    edges_data = json.load(f)

# --- Node Mapping (CRITICAL) ---
# Create a map from raw node_id to a continuous index [0, 1, 2...]
nodes_data.sort(key=lambda x: x["node_id"])
id_map = {node["node_id"]: i for i, node in enumerate(nodes_data)}

x_raw = [node["features"] for node in nodes_data]
node_in_dim = len(x_raw[0]) # Verified from sample: 3
print(f"📊 Node Features detected: {node_in_dim}")

node_scaler = StandardScaler()
x_scaled = node_scaler.fit_transform(x_raw)
x_tensor = torch.tensor(x_scaled, dtype=torch.float)

# --- Process Edges ---
edge_index_list = []
edge_attr_raw = []
y_raw = []

for edge in edges_data:
    # Ensure source/target exist in our node list and weight is valid
    if edge["source"] in id_map and edge["target"] in id_map:
        if edge["weight"] < 900.0:
            edge_index_list.append([id_map[edge["source"]], id_map[edge["target"]]])
            edge_attr_raw.append(edge["features"])
            y_raw.append(edge["weight"])

edge_in_dim = len(edge_attr_raw[0]) # Verified from sample: ~62
print(f"📊 Edge Features detected: {edge_in_dim}")

edge_index_tensor = torch.tensor(edge_index_list, dtype=torch.long).t().contiguous()
edge_scaler = StandardScaler()
edge_attr_scaled = edge_scaler.fit_transform(edge_attr_raw)
edge_attr_tensor = torch.tensor(edge_attr_scaled, dtype=torch.float)
y_tensor = torch.tensor(y_raw, dtype=torch.float).view(-1, 1)

data = Data(x=x_tensor, edge_index=edge_index_tensor, edge_attr=edge_attr_tensor, y=y_tensor)

indices = np.arange(data.num_edges)
train_idx, test_idx = train_test_split(indices, test_size=0.2, random_state=42)
train_idx = torch.tensor(train_idx, dtype=torch.long)
test_idx = torch.tensor(test_idx, dtype=torch.long)

# ==========================================
# 2. MODEL DEFINITION (EDGE REGRESSION)
# ==========================================
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
            GELU(),
            self.dropout,
            Linear(hidden_dim * 2, hidden_dim),
            GELU(),
            Linear(hidden_dim, 1) # Predicts weight (transit time)
        )

    def forward(self, x, edge_index, edge_attr, query_edge_indices):
        h = self.node_encoder(x)
        
        for i, conv in enumerate(self.convs):
            h_res = h
            h = conv(h, edge_index)
            h = self.norms[i](h)
            h = GELU()(h)
            h = self.dropout(h)
            h = h + h_res 
            
        # Select embeddings for the specific edges we are predicting
        src_idx, tgt_idx = query_edge_indices[0], query_edge_indices[1]
        h_src, h_tgt = h[src_idx], h[tgt_idx]
        
        # Final concatenation for regression
        edge_inputs = torch.cat([h_src, h_tgt, edge_attr], dim=1)
        return self.edge_predictor(edge_inputs)

# ==========================================
# 3. TRAINING
# ==========================================
device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
model = RobustSupplyChainSAGE(node_in_dim, edge_in_dim, 128, 4).to(device)
data = data.to(device)

optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, 'min', patience=15)
criterion = torch.nn.L1Loss()

print(f"🚀 Training on {device}...")
for epoch in range(1, 501):
    model.train()
    optimizer.zero_grad()
    
    t_edges = data.edge_index[:, train_idx]
    t_attrs = data.edge_attr[train_idx]
    
    out = model(data.x, data.edge_index, t_attrs, t_edges)
    out = torch.relu(out)
    loss = criterion(out, data.y[train_idx])
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    optimizer.step()
    
    if epoch % 20 == 0:
        model.eval()
        with torch.no_grad():
            v_edges = data.edge_index[:, test_idx]
            v_attrs = data.edge_attr[test_idx]
            v_out = model(data.x, data.edge_index, v_attrs, v_edges)
            v_mae = torch.mean(torch.abs(v_out - data.y[test_idx]))
            r2 = r2_score(data.y[test_idx].cpu().numpy(), v_out.cpu().numpy())
            
        print(f"Epoch {epoch:03d} | Loss: {loss.item():.4f} | MAE: {v_mae:.4f} | R²: {r2:.3f}")
        scheduler.step(v_mae)

# Save
torch.save(model.state_dict(), "supply_chain_model.pth")
joblib.dump(node_scaler, "node_scaler.pkl")
joblib.dump(edge_scaler, "edge_scaler.pkl")
print("✅ Done.")