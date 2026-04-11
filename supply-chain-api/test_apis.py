import os
import json
import requests
import urllib.parse
from dotenv import load_dotenv
from typing import List, Dict, Any

load_dotenv()

print("🛡️ API Test Script - Weather + Real-time News\n")

# ====================== CONFIG ======================
CITIES: List[str] = [
    "Bengaluru",      # your location
    "Mumbai",
    "Delhi",
    "New York",
    "Tehran"
]

OPENWEATHER_KEY = os.getenv("OPENWEATHER_API_KEY")
NEWS_DATA_KEY    = os.getenv("NEWS_DATA_API_KEY")

if not OPENWEATHER_KEY or not NEWS_DATA_KEY:
    print("❌ Missing API keys in .env file!")
    exit(1)

# ====================== WEATHER ======================
def fetch_weather(cities: List[str]) -> Dict[str, Any]:
    print("🌤️ Fetching weather from OpenWeatherMap...")
    weather_data = {}
    for city in cities:
        try:
            url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={OPENWEATHER_KEY}&units=metric"
            res = requests.get(url, timeout=8).json()
            
            if res.get("cod") == 200:
                weather_data[city] = {
                    "condition": res["weather"][0]["description"],
                    "temp_c": round(res["main"]["temp"], 1),
                    "wind_speed_kmh": round(res["wind"].get("speed", 0) * 3.6, 1),
                    "humidity": res["main"].get("humidity", "N/A")
                }
                print(f"   ✅ {city}: {weather_data[city]['condition']}, {weather_data[city]['temp_c']}°C")
            else:
                weather_data[city] = {"error": res.get("message", "Unknown error")}
                print(f"   ❌ {city}: {res.get('message')}")
        except Exception as e:
            weather_data[city] = {"error": str(e)}
            print(f"   ❌ {city}: API error")
    return weather_data


def fetch_live_news(cities: List[str], topic: str) -> Dict[str, str]:
    news_data = {}
    
    print(f"📰 Fetching {topic.upper()} news from NewsData.io...")

    TOPIC_KEYWORDS = {
        "logistics": "(supply chain OR port OR cargo OR shipping OR freight OR trucking OR customs)",
        "geo":       "(war OR sanctions OR conflict OR ceasefire OR embargo OR geopolitical OR blockade)"
    }

    keywords = TOPIC_KEYWORDS.get(topic, "")

    for city in cities:
        try:
            q = f"{city} AND {keywords}"
            url = (
                f"https://newsdata.io/api/1/news"
                f"?apikey={NEWS_DATA_KEY}"
                f"&q={urllib.parse.quote(q)}"
                f"&language=en"
                f"&size=2"
            )
            res = requests.get(url, timeout=12).json()

            status = res.get("status")
            if status == "error":
                error_msg = res.get("message") or json.dumps(res)
                print(f"   ❌ {city}: API error → {error_msg}")
                news_data[city] = f"API Error: {error_msg}"
                continue

            articles = res.get("results", [])

            if not isinstance(articles, list):
                print(f"   ⚠️  {city}: Unexpected response format")
                news_data[city] = "Unexpected API response"
                continue

            if articles:
                headlines = [f"- {a.get('title', 'No title')}" for a in articles]  # however many came back
                news_data[city] = "\n".join(headlines)
                print(f"   ✅ {city}: {len(articles)} article(s)")
            else:
                news_data[city] = "No relevant news found."
                print(f"   ⚠️  {city}: No matching articles")

        except Exception as e:
            print(f"   ❌ {city}: Request failed → {e}")
            news_data[city] = f"Request failed: {e}"

    return news_data

# ====================== RUN TEST ======================
if __name__ == "__main__":
    print("=" * 60)
    print("TESTING BOTH APIS WITH CITIES:")
    print(CITIES)
    print("=" * 60 + "\n")

    # 1. Weather
    weather = fetch_weather(CITIES)
    
    print("\n" + "=" * 60)
    
    # 2. Logistics News
    logistics_news = fetch_live_news(CITIES, "logistics")
    
    print("\n" + "=" * 60)
    
    # 3. Geopolitical News
    geo_news = fetch_live_news(CITIES, "geo")

    # ====================== FINAL OUTPUT ======================
    print("\n\n" + "═" * 70)
    print("FINAL COMBINED OUTPUT (ready to feed into Gemini)")
    print("═" * 70)
    
    print("\n🌤️ WEATHER DATA:")
    print(json.dumps(weather, indent=2))
    
    print("\n📰 LOGISTICS NEWS:")
    print(json.dumps(logistics_news, indent=2))
    
    print("\n🌍 GEOPOLITICAL NEWS:")
    print(json.dumps(geo_news, indent=2))
    
    print("\n✅ Test completed! You can now copy-paste this output into your risk engine if you want.")