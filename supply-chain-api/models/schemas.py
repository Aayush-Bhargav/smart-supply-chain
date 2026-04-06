from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class RouteSegment(BaseModel):
    from_city: str
    to_city: str
    mode: str
    days: float
    base_time: float

class RouteResponse(BaseModel):
    source: str
    target: str
    category_name: str
    quantity: int
    priority_level: str
    dispatch_date: datetime
    total_transit_days: float
    route: List[RouteSegment]

class RouteRequest(BaseModel):
    source: str
    target: str
    category_name: str
    quantity: int
    priority_level: str
    dispatch_date: Optional[datetime] = None
