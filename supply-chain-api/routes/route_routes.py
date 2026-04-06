from fastapi import APIRouter, HTTPException, Depends
from typing import Union

from models.schemas import RouteRequest
from services.route_service import RouteService

router = APIRouter(prefix="/api", tags=["routes"])

class RouteRequestAPI(RouteRequest):
    source_city: str
    target_city: str
    category_name: str
    quantity: float = 1.0
    priority_level: Union[str, float] = "Standard Class"
    dispatch_date: str

def get_route_service() -> RouteService:
    # This will be overridden in main.py
    pass

@router.get("/")
def health_check(route_service: RouteService = Depends(get_route_service)):
    """Health check endpoint"""
    return {
        "status": "live",
        "nodes": route_service.graph.number_of_nodes(),
        "edges": route_service.graph.number_of_edges(),
        "categories": route_service.num_categories,
    }

@router.post("/find_route")
def find_route(query: RouteRequestAPI, route_service: RouteService = Depends(get_route_service)):
    """Find optimal route between two cities"""
    try:
        result = route_service.find_route(query)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
