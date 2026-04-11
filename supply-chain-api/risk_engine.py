import os
import re
import json
import time
import urllib.parse
import requests
import google.generativeai as genai
from typing import TypedDict, Dict, Any, List
from langgraph.graph import StateGraph
from pydantic import BaseModel
from dotenv import load_dotenv
 
load_dotenv()
 
print("🛡️ API keys loaded from .env")
print("🛡️ Initializing Gemini Risk Engine...")
 
# ==========================================
# API KEYS & CONFIG
# ==========================================
GEMINI_API_KEY       = os.getenv("GEMINI_API_KEY", "YOUR_GEMINI_KEY")
OPENWEATHER_API_KEY  = os.getenv("OPENWEATHER_API_KEY", "YOUR_OPENWEATHER_KEY")
GNEWS_API_KEY        = os.getenv("GNEWS_API_KEY", "YOUR_NEWSDATA_KEY")
 
genai.configure(api_key=GEMINI_API_KEY)
# Using 1.5-flash to completely bypass the 5-requests-per-minute limit of 2.5
risk_model = genai.GenerativeModel("gemini-1.5-flash")
 
# ==========================================
# HELPERS
# ==========================================
def _normalize_city(city: str) -> str:
    """Consistent casing so cache keys never mismatch."""
    return city.strip().title()
 
def _gemini_with_retry(prompt: str, generation_config, max_retries: int = 2):
    """Calls Gemini with automatic retry on 429."""
    for attempt in range(max_retries + 1):
        try:
            return risk_model.generate_content(prompt, generation_config=generation_config)
        except Exception as e:
            err_str = str(e)
            match = re.search(r'retry_delay\s*\{\s*seconds:\s*(\d+)', err_str)
            wait = int(match.group(1)) + 2 if match else 45
 
            if attempt < max_retries and ("429" in err_str or "quota" in err_str.lower()):
                print(f"   ⏳ Gemini rate-limited. Waiting {wait}s then retrying (attempt {attempt + 1}/{max_retries})...")
                time.sleep(wait)
            else:
                raise   
 
# ==========================================
# 1. LIVE DATA FETCHERS
# ==========================================
def fetch_live_weather(cities: List[str]) -> Dict[str, Any]:
    weather_data = {}
    print(f"🌤️ Fetching weather for {len(cities)} cities (with micro-throttling)...")
 
    for city in cities:
        try:
            url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={OPENWEATHER_API_KEY}&units=metric"
            print(f"🚨 API CALL [WEATHER]: Requesting OpenWeatherMap for -> {city}")
            res = requests.get(url, timeout=5).json()
 
            if res.get("cod") == 200:
                weather_data[city] = {
                    "condition":      res["weather"][0]["description"],
                    "temp_c":         res["main"]["temp"],
                    "wind_speed_kmh": res["wind"]["speed"] * 3.6,
                    "humidity":       res["main"].get("humidity", "N/A"),
                }
            else:
                weather_data[city] = {"condition": "Unknown", "temp_c": 20, "wind_speed_kmh": 5}
 
            time.sleep(0.25)  
 
        except Exception as e:
            print(f"   ⚠️ Weather API skip for {city}: {e}")
            weather_data[city] = {"condition": "API Error", "temp_c": 20, "wind_speed_kmh": 5}
 
    return weather_data

def fetch_live_news(cities: List[str], topic: str) -> Dict[str, str]:
    news_data = {city: "No relevant disruptive news found." for city in cities}
    print(f"📰 Fetching {topic.upper()} news from GNews (Batched)...")

    TOPIC_KEYWORDS = {
        "logistics": '("port strike" OR "airport closure" OR "supply chain" OR "logistics" OR "customs delay" OR "cargo")',
        "geo":       '("war" OR "conflict" OR "sanctions" OR "blockade" OR "embargo" OR "protest" OR "riot")'
    }

    keywords = TOPIC_KEYWORDS.get(topic, "")
    chunk_size = 3
    city_chunks = [cities[i:i + chunk_size] for i in range(0, len(cities), chunk_size)]

    for chunk in city_chunks:
        try:
            city_query = "(" + " OR ".join([f'"{c}"' for c in chunk]) + ")"
            query = f"{city_query} AND {keywords}"
            url = f"https://gnews.io/api/v4/search?q={urllib.parse.quote(query)}&lang=en&max=10&apikey={GNEWS_API_KEY}"

            print(f"🚨 API CALL [NEWS]: Requesting GNews for chunk -> {chunk}")
            res = requests.get(url, timeout=12).json()

            if "errors" in res:
                error_msg = str(res["errors"])
                print(f"   ❌ API error for chunk {chunk} → {error_msg}")
                if "rate" in error_msg.lower() or "limit" in error_msg.lower():
                    print("   🚨 Rate limit hit! Falling back to safe defaults for remaining cities.")
                    break
                continue

            articles = res.get("articles", [])
            if articles:
                for article in articles:
                    title = article.get('title', 'No title')
                    desc = article.get('description', '')
                    content_blob = f"{title} {desc}".lower()

                    for city in chunk:
                        if city.lower() in content_blob:
                            headline = f"- {title}"
                            if news_data[city] == "No relevant disruptive news found.":
                                news_data[city] = headline
                            else:
                                news_data[city] += f"\n{headline}"
                                
                print(f"   ✅ Processed {len(articles)} article(s) for chunk: {chunk}")
            else:
                print(f"   ⚠️  No matching articles for chunk: {chunk}")

            time.sleep(1.0)

        except Exception as e:
            print(f"   ❌ Batch request failed for {chunk} → {e}")

    return news_data

# ==========================================
# 2. STATE AND SCHEMAS
# ==========================================
class RiskState(TypedDict):
    nodes:          List[str]
    weather_data:   Dict[str, Any]
    logistics_news: Dict[str, str]
    geo_news:       Dict[str, str]
    weather_risk:   Dict[str, float]
    news_risk:      Dict[str, float]
    geo_risk:       Dict[str, float]
    final_risk:     Dict[str, Dict[str, Any]]
    
    # THE FIX: Tell LangGraph not to strip these variables out of state!
    mock_disruption_city: Any
    mock_disruption_type: Any
 
class ComprehensiveRiskOutput(BaseModel):
    weather_risks: Dict[str, float]
    news_risks:    Dict[str, float]
    geo_risks:     Dict[str, float]
 
# ==========================================
# 3. LANGGRAPH AGENTS
# ==========================================
def master_risk_agent(state: RiskState):
    print("🧠 [DEBUG] Master Risk Agent called with cities:", state['nodes'])
    
    prompt = f"""
    You are a Master Logistics Risk Analyst. Evaluate the risk (0.0=Safe, 1.0=Catastrophic)
    for the following cities across three categories: Weather, Logistics, and Geopolitical.

    CRITICAL FALSE-POSITIVE INSTRUCTIONS:
    - ONLY assign >0.0 if the data explicitly describes an ACTUAL, CURRENT NEGATIVE DISRUPTION.
    - If news is unrelated, positive, or says "No relevant news found", assign 0.0.

    DATA:
    Weather:           {json.dumps(state['weather_data'])}
    Logistics News:    {json.dumps(state['logistics_news'])}
    Geopolitical News: {json.dumps(state['geo_news'])}

    Return a valid JSON object matching the requested schema.
    Every city listed must appear in all three risk dictionaries.
    Cities: {state['nodes']}
    """

    try:
        print(f"🚨 API CALL [GEMINI - RISK]: Sending 1 request to {risk_model.model_name}")
        response = _gemini_with_retry(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=ComprehensiveRiskOutput,
            ),
        )
        result = json.loads(response.text)
        state["weather_risk"] = result.get("weather_risks", {})
        state["news_risk"]    = result.get("news_risks",    {})
        state["geo_risk"]     = result.get("geo_risks",     {})
        print("✅ Gemini risk analysis succeeded")

    except Exception as e:
        print(f"⚠️ Master Agent Error: {e}")
        print("⚠️  Falling back to safe defaults...")

        state["weather_risk"] = {c: 0.0 for c in state["nodes"]}
        state["news_risk"]    = {c: 0.0 for c in state["nodes"]}
        state["geo_risk"]     = {c: 0.0 for c in state["nodes"]}

        # === THE CHAOS FALLBACK ===
        if state.get("mock_disruption_city"):
            mock_city = state["mock_disruption_city"]
            mock_type = state.get("mock_disruption_type")
            if mock_type == "Weather":
                state["weather_risk"][mock_city] = 0.95
                print(f"🌪️  CHAOS FALLBACK ACTIVATED → Forced weather risk 0.95 for {mock_city}")
            elif mock_type == "Logistics":
                state["news_risk"][mock_city] = 0.90
                print(f"🌪️  CHAOS FALLBACK ACTIVATED → Forced logistics risk 0.90 for {mock_city}")
            elif mock_type == "Geopolitical":
                state["geo_risk"][mock_city] = 0.92
                print(f"🌪️  CHAOS FALLBACK ACTIVATED → Forced geo risk 0.92 for {mock_city}")

    return state
 
 
def fusion_agent(state: RiskState):
    final = {}
    for city in state["nodes"]:
        w = state["weather_risk"].get(city, 0.0)
        n = state["news_risk"].get(city, 0.0)
        g = state["geo_risk"].get(city, 0.0)
 
        avg_risk = (0.35 * w) + (0.35 * n) + (0.30 * g)
        
        # THE FIX: Ensure catastrophic events aren't diluted by averages
        risk = max(avg_risk, w, n, g)
 
        reason = "Normal operations"
        if risk > 0.4:
            if w >= n and w >= g:
                reason = "Severe Weather Disruption"
            elif n >= g:
                reason = "Logistics/Port Disruption"
            else:
                reason = "Geopolitical/Security Risk"
 
        final[city] = {
            "risk":       round(risk, 3),
            "reason":     reason,
            "components": {
                "weather": round(w, 2),
                "news":    round(n, 2),
                "geo":     round(g, 2),
            },
        }
    state["final_risk"] = final
    return state
 
# ==========================================
# 4. COMPILE LANGGRAPH
# ==========================================
builder = StateGraph(RiskState)
builder.add_node("master_risk", master_risk_agent)
builder.add_node("fusion",      fusion_agent)
builder.set_entry_point("master_risk")
builder.add_edge("master_risk", "fusion")
risk_graph = builder.compile()
 
# ==========================================
# 5. MAIN EXPORT
# ==========================================
def assess_route_risk(
    cities: List[str],
    mock_disruption_city: str = None,
    mock_disruption_type: str = None,
) -> Dict[str, Any]:
    cities = [_normalize_city(c) for c in cities]
    if mock_disruption_city:
        mock_disruption_city = _normalize_city(mock_disruption_city)

    print("\n" + "="*80)
    print("🚨 [CHAOS DEBUG] assess_route_risk called")
    print(f"   Cities received          : {cities}")
    print(f"   mock_disruption_city     : {mock_disruption_city}")
    print(f"   mock_disruption_type     : {mock_disruption_type}")
    print("="*80 + "\n")

    weather_data = fetch_live_weather(cities)
    logistics_news = fetch_live_news(cities, "logistics")
    geo_news = fetch_live_news(cities, "geo")

    if mock_disruption_city:
        print(f"🌪️ [CHAOS] Attempting injection into '{mock_disruption_city}' ({mock_disruption_type})")
        if mock_disruption_type == "Weather":
            weather_data[mock_disruption_city] = {"condition": "Category 5 Hurricane", "temp_c": 28, "wind_speed_kmh": 250}
        elif mock_disruption_type == "Logistics":
            logistics_news[mock_disruption_city] = "- Massive port workers strike: all cargo halted indefinitely."
        elif mock_disruption_type == "Geopolitical":
            geo_news[mock_disruption_city] = "- Sudden border closure and military blockade imposed."

    initial_state: RiskState = {
        "nodes": cities,
        "weather_data": weather_data,
        "logistics_news": logistics_news,
        "geo_news": geo_news,
        "weather_risk": {},
        "news_risk": {},
        "geo_risk": {},
        "final_risk": {},
        "mock_disruption_city": mock_disruption_city,
        "mock_disruption_type": mock_disruption_type,
    }

    print("🧠 Running Gemini Risk Analysis...")
    result = risk_graph.invoke(initial_state)
    final_risk = result["final_risk"]

    if mock_disruption_city and mock_disruption_city in final_risk:
        print(f"✅ [CHAOS SUCCESS] Final risk for {mock_disruption_city} = {final_risk[mock_disruption_city]['risk']}")
        
    return final_risk