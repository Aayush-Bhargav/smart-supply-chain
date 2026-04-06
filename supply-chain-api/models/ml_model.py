import torch
import torch.nn.functional as F
from torch.nn import Linear, Sequential, ReLU, Dropout, BatchNorm1d, LayerNorm
from torch_geometric.nn import SAGEConv

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
            ReLU(),
            self.dropout,
            Linear(hidden_dim * 2, hidden_dim),
            ReLU(),
            Linear(hidden_dim, 1) # Predicts weight (transit time)
        )

    def forward(self, x, edge_index, edge_attr, query_edge_indices):
        h = self.node_encoder(x)
        
        for i, conv in enumerate(self.convs):
            h_res = h
            h = conv(h, edge_index)
            h = self.norms[i](h)
            h = ReLU()(h)
            h = self.dropout(h)
            h = h + h_res 
            
        # Select embeddings for the specific edges we are predicting
        src_idx, tgt_idx = query_edge_indices[0], query_edge_indices[1]
        h_src, h_tgt = h[src_idx], h[tgt_idx]
        
        # Final concatenation for regression
        edge_inputs = torch.cat([h_src, h_tgt, edge_attr], dim=1)
        return self.edge_predictor(edge_inputs)
