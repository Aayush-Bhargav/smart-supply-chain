import math
from datetime import datetime
from typing import List, Optional, Tuple

import joblib
import networkx as nx
import numpy as np
import torch

from models.schemas import RouteRequest, RouteResponse, RouteSegment
from models.ml_model import RobustSupplyChainSAGE
from utils.config import MODEL_FILE, EDGE_SCALER_FILE
from utils.graph_utils import (
    haversine, 
    parse_dispatch_datetime, 
    encode_priority, 
    one_hot_category,
    infer_scheduled_days
)
from utils.constants import (
    CATEGORY_START_IDX,
    DIST_IDX,
    CROSS_BORDER_IDX,
    MONTH_SIN_IDX,
    MONTH_COS_IDX,
    DAY_SIN_IDX,
    DAY_COS_IDX,
    HOUR_SIN_IDX,
    HOUR_COS_IDX,
    SCHEDULED_DAYS_IDX,
    PREFERENCE_IDX,
    QUANTITY_IDX,
    PHYSICAL_MODE_IDX,
    PHYSICAL_MODE_TO_IDX
)

class RouteService:
    def __init__(self, graph: nx.MultiDiGraph, model: RobustSupplyChainSAGE, 
                 category_to_idx: dict, num_categories: int, 
                 edge_scaler, node_features: torch.Tensor, 
                 edge_index: torch.Tensor, base_edge_features: torch.Tensor,
                 id_to_city: dict, id_map: dict, nodes_data: List[dict]):
        self.graph = graph
        self.model = model
        self.category_to_idx = category_to_idx
        self.num_categories = num_categories
        self.edge_scaler = edge_scaler
        self.node_features = node_features
        self.edge_index = edge_index
        self.base_edge_features = base_edge_features
        self.id_to_city = id_to_city
        self.id_map = id_map
        self.nodes_data = nodes_data

    def build_request_edge_features(self, query: RouteRequest) -> List[List[float]]:
        """Build edge features for a route request"""
        dt = parse_dispatch_datetime(query.dispatch_date)

        month_sin = float(np.sin(2 * np.pi * dt.month / 12.0))
        month_cos = float(np.cos(2 * np.pi * dt.month / 12.0))
        day_sin = float(np.sin(2 * np.pi * dt.weekday() / 7.0))
        day_cos = float(np.cos(2 * np.pi * dt.weekday() / 7.0))
        hour_sin = float(np.sin(2 * np.pi * dt.hour / 24.0))
        hour_cos = float(np.cos(2 * np.pi * dt.hour / 24.0))

        preference_encoded = encode_priority(query.priority_level)
        scheduled_days = infer_scheduled_days(preference_encoded, query.scheduled_days)

        quantity_norm = float(np.log1p(query.quantity))
        category_vec = one_hot_category(query.category_name, self.category_to_idx, self.num_categories)

        features = []
        for src_id, tgt_id, edge_data in self.graph.edges(data=True):
            dist_km = edge_data.get("distance_km", 0.0)
            cross_border = 1.0 if edge_data.get("source_country") != edge_data.get("target_country") else 0.0
            mode_encoded = PHYSICAL_MODE_TO_IDX.get(edge_data.get("mode"), 0.0)

            edge_feat = [0.0] * len(self.base_edge_features[0])
            edge_feat[DIST_IDX] = dist_km
            edge_feat[CROSS_BORDER_IDX] = cross_border
            edge_feat[MONTH_SIN_IDX] = month_sin
            edge_feat[MONTH_COS_IDX] = month_cos
            edge_feat[DAY_SIN_IDX] = day_sin
            edge_feat[DAY_COS_IDX] = day_cos
            edge_feat[HOUR_SIN_IDX] = hour_sin
            edge_feat[HOUR_COS_IDX] = hour_cos
            edge_feat[SCHEDULED_DAYS_IDX] = scheduled_days
            edge_feat[PREFERENCE_IDX] = preference_encoded
            edge_feat[QUANTITY_IDX] = quantity_norm
            edge_feat[PHYSICAL_MODE_IDX] = mode_encoded

            for i, val in enumerate(category_vec):
                edge_feat[CATEGORY_START_IDX + i] = val

            features.append(edge_feat)

        return features

    def find_route(self, query: RouteRequest) -> RouteResponse:
        """Find optimal route using ML-enhanced weights"""
        print(f"🔍 Finding route: {query.source_city} → {query.target_city}")

        # Build request-specific edge features
        request_edge_features = self.build_request_edge_features(query)
        edge_attr_scaled = self.edge_scaler.transform(request_edge_features)
        edge_attr_tensor = torch.tensor(edge_attr_scaled, dtype=torch.float)

        # Get ML predictions for all edges
        edge_order = []
        for src, tgt, key in self.graph.edges(keys=True):
            edge_order.append((src, tgt, key))

        query_edge_indices = torch.zeros((2, len(edge_order)), dtype=torch.long)
        for i, (src, tgt, _) in enumerate(edge_order):
            query_edge_indices[0, i] = src
            query_edge_indices[1, i] = tgt

        with torch.no_grad():
            predictions = self.model(
                self.node_features, 
                self.edge_index, 
                edge_attr_tensor, 
                query_edge_indices
            ).view(-1).cpu().numpy()

        # Update weights on the NetworkX graph
        for idx, (u, v, k) in enumerate(edge_order):
            edge_data = self.graph[u][v][k]
            delay = float(predictions[idx])
            delay = max(0.0, delay)
            physics_time = edge_data["base_time"]
            final_time = physics_time + delay
            
            # Apply penalty for cross-border routes when source and target are same country
            if edge_data["source_country"] != edge_data["target_country"]:
                src_id = self.id_map.get(query.source_city)
                tgt_id = self.id_map.get(query.target_city)
                if src_id and tgt_id:
                    src_country = self.nodes_data[src_id]["country"]
                    tgt_country = self.nodes_data[tgt_id]["country"]
                    if src_country == tgt_country:
                        final_time *= 1000   # strong penalty
            
            self.graph[u][v][k]["weight"] = final_time

        # Find shortest path
        try:
            src_id = self.id_map[query.source_city]
            tgt_id = self.id_map[query.target_city]
            path = nx.shortest_path(self.graph, src_id, tgt_id, weight="weight")
        except Exception as e:
            raise ValueError(f"No route found: {str(e)}")

        # Build route segments
        route_segments = []
        total_time = 0.0

        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            edge_data = self.graph[u][v][0]
            
            segment = RouteSegment(
                from_city=self.id_to_city[u],
                to_city=self.id_to_city[v],
                mode=edge_data["mode"],
                days=edge_data["weight"],
                base_time=edge_data["base_time"]
            )
            route_segments.append(segment)
            total_time += edge_data["weight"]

        return RouteResponse(
            source=query.source_city,
            target=query.target_city,
            category_name=query.category_name,
            quantity=int(query.quantity),
            priority_level=str(query.priority_level),
            dispatch_date=parse_dispatch_datetime(query.dispatch_date),
            total_transit_days=total_time,
            route=route_segments
        )
