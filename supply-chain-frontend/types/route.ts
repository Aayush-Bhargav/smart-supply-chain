export interface RouteRequest {
  source_city: string;
  target_city: string;
  category_name: string;
  quantity: number;
  priority_level: string;
  dispatch_date: string;
  scheduled_days: number | null;
}

export interface RouteSegment {
  from: string;
  to: string;
  mode: string;
  days: number;
  base_time: number;
}

export interface RouteResponse {
  source: string;
  target: string;
  dispatch_date: string;
  category_name: string;
  quantity: number;
  priority_level: string;
  scheduled_days: number;
  total_transit_days: number;
  route: RouteSegment[];
}
