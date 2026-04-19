export interface RouteSegment {
  from: string;
  to: string;
  mode: string;
  days: number;
  base_time: number;
  risk_score: number;
  risk_reason: string;
  carbon_kg: number;               // <-- NEW
}

export interface RouteRequest {
  source_city: string;
  target_city: string;
  category_name: string;
  quantity: number;
  priority_level: string;
  dispatch_date: string;
  scheduled_days?: number | null;
  delivery_type?: string;
  transit_hubs: string[];
  mock_disruption_city?: string | null;
  mock_disruption_type?: string | null;
}

export interface RecommendedRoute {
  option: number;
  total_transit_days: number;
  route_risk_level: number;
  total_carbon_kg: number;
  route: RouteSegment[];
  forced_through_hubs: boolean;
  has_high_risk_hub: boolean;
}

export interface RouteResponse {
  source: string;
  target: string;
  category_name: string;
  quantity: number;
  delivery_type: string;
  transit_hubs: string[];
  dispatch_date: string;
  priority_level: string;
  recommended_routes: RecommendedRoute[];
  node_risks: Record<string, any>;
  city_coordinates?: Record<string, { lat: number; lng: number }>;
  route?: RouteSegment[];
  total_transit_days?: number;
}
