import google.generativeai as genai

genai.configure(api_key="YOUR_GEMINI_API_KEY")

model = genai.GenerativeModel("gemini-2.5-flash-lite") 
from typing import TypedDict, Dict, Any

class RiskState(TypedDict):
    nodes: list  # cities / hubs
    weather_data: Dict[str, Any]
    news_data: str
    geo_data: Dict[str, Any]

    weather_risk: Dict[str, float]
    news_risk: Dict[str, float]
    geo_risk: Dict[str, float]

    final_risk: Dict[str, Dict[str, Any]]
def call_gemini(prompt: str):
    response = model.generate_content(prompt)
    return response.text

import json

def weather_agent(state: RiskState):
    prompt = f"""
    For the following cities: {state['nodes']}

    Given weather data:
    {state['weather_data']}

    Output JSON:
    {{
      "city": risk_score (0-1)
    }}
    """

    output = call_gemini(prompt)

    try:
        state["weather_risk"] = json.loads(output)
    except:
        state["weather_risk"] = {}

    return state

def news_agent(state: RiskState):
    prompt = f"""
    Analyze logistics disruptions from news:

    {state['news_data']}

    Cities: {state['nodes']}

    Output JSON:
    {{
      "city": risk_score (0-1)
    }}
    """

    output = call_gemini(prompt)

    try:
        state["news_risk"] = json.loads(output)
    except:
        state["news_risk"] = {}

    return state

def geo_agent(state: RiskState):
    prompt = f"""
    Assess geopolitical/logistics risk:

    Data:
    {state['geo_data']}

    Cities: {state['nodes']}

    Output JSON:
    {{
      "city": risk_score (0-1)
    }}
    """

    output = call_gemini(prompt)

    try:
        state["geo_risk"] = json.loads(output)
    except:
        state["geo_risk"] = {}

    return state

def fusion_agent(state: RiskState):
    final = {}

    for city in state["nodes"]:
        w = state["weather_risk"].get(city, 0)
        n = state["news_risk"].get(city, 0)
        g = state["geo_risk"].get(city, 0)

        risk = 0.4*w + 0.4*n + 0.2*g

        final[city] = {
            "risk": round(risk, 3),
            "components": {
                "weather": w,
                "news": n,
                "geo": g
            }
        }

    state["final_risk"] = final
    return state

from langgraph.graph import StateGraph

builder = StateGraph(RiskState)

builder.add_node("weather", weather_agent)
builder.add_node("news", news_agent)
builder.add_node("geo", geo_agent)
builder.add_node("fusion", fusion_agent)

# Flow
builder.set_entry_point("weather")

builder.add_edge("weather", "news")
builder.add_edge("news", "geo")
builder.add_edge("geo", "fusion")

graph = builder.compile()


initial_state = {
    "nodes": ["Mumbai", "Dubai", "Singapore"],
    "weather_data": {...},
    "news_data": "Cyclone alert in Mumbai, port strike in Singapore",
    "geo_data": {...},
    "weather_risk": {},
    "news_risk": {},
    "geo_risk": {},
    "final_risk": {}
}

result = graph.invoke(initial_state)

print(result["final_risk"])