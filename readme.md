# Smart Supply Chain Control Tower

*An AI-native logistics control tower that combines graph-based delay prediction, live risk intelligence, and operator-in-the-loop rerouting for global shipments.*

[![Live Demo](https://img.shields.io/badge/Live_Demo-Hosted_on_Vercel-black?style=for-the-badge&logo=vercel)]
[![Backend](https://img.shields.io/badge/API-Google_Cloud_Run-blue?style=for-the-badge&logo=googlecloud)]

> **Live Application:** [Access the Smart Supply Chain Control Tower here](https://supply-chain-frontend-omega.vercel.app)
## Overview

Modern supply chains rarely fail because teams lack routes; they fail because static routes ignore changing conditions. Weather events, labor disruptions, geopolitical incidents, and mode constraints can turn a mathematically short path into an operationally bad one. This repository implements a working control tower that treats routing as a live decision problem instead of a one-time map query.

The backend builds a logistics graph from `DataCoSupplyChainDataset.csv`, trains a single PyTorch Geometric GraphSAGE regressor (`RobustSupplyChainSAGE`), and uses that model to predict per-edge delay. At runtime, the API adds that predicted delay to a mode-specific physics baseline for truck, air, and ocean movement, then searches for the best path under user constraints such as delivery mode filters and forced transit hubs. The committed inference artifacts currently load a network of 3,902 city nodes, 70,036 inference edges, and 50 product categories.

On top of the routing layer, the project runs a Gemini-powered LangGraph risk engine that pulls live weather from OpenWeatherMap and logistics/geopolitical headlines from GNews, converts them into per-city disruption scores, and uses those scores inside the Chaos Simulator and the live rerouting workflow. The Next.js frontend turns that backend into a judge-friendly experience: users can plan routes, compare options, view an AI recommendation, simulate disruptions with the Chaos Simulator, save shipments to Firestore, and monitor active routes from a dashboard-style control tower.

## Key Features

- Predictive routing with a single 4-layer GraphSAGE edge regressor that estimates shipment delay for every leg in the logistics graph.
- Physics-aware transit scoring that adds learned delay to transport-specific baseline travel time for `Truck`, `Air`, and `Ocean`.
- Automated top-route generation using NetworkX shortest-path search plus disruption-aware scoring when simulated or live risk data is present.
- Priority-aware Gemini route selection through `/select_best_route`, which produces a recommended option, executive summary, and trade-off bullets.
- LangGraph risk engine that fuses OpenWeatherMap weather data, GNews logistics headlines, GNews geopolitical headlines, and Gemini JSON analysis into per-city risk snapshots for simulation and live tracking.
- Chaos Simulator that injects synthetic `Weather`, `Logistics`, or `Geopolitical` disruptions against a chosen city to stress-test rerouting behavior.
- Live Control Tower dashboard with saved shipments, checkpoint progression, per-shipment live tracking toggles, hotspot monitoring, and reroute preview modals.
- Transit hub forcing and delivery-mode constraints such as `Only Air`, `Only Ocean`, `Only Truck`, `No Air`, `No Ocean`, and `No Truck`.
- Carbon tracking at both leg and route level using transport-mode emission factors.
- Firebase-backed persistence with authenticated user shipments stored in the `user_shipments` Firestore collection.

## System Architecture

```text
Next.js Client
  -> FastAPI Routing Gateway
      -> GNN Delay Regressor (PyTorch Geometric GraphSAGE)
      -> Risk Engine (LangGraph + Gemini + OpenWeatherMap + GNews)
      -> NetworkX Route Search / Re-route Logic
  -> Firestore Persistence + Dashboard Monitoring
```

### Client: Next.js Frontend

The frontend lives in `supply-chain-frontend/` and is built with Next.js 14, React 18, TypeScript, and Tailwind CSS. The home page collects shipment inputs such as source city, destination city, category, quantity, priority level, dispatch timestamp, delivery-mode restrictions, optional transit hubs, and optional disruption injections. City search is powered by `public/data/unique_cities.txt`, and the route view renders maps with React Leaflet plus OpenStreetMap tiles.

### Gateway: FastAPI Backend

The backend entrypoint is `supply-chain-api/main.py`, which imports `app` from `main_old.py`. On startup, FastAPI loads the committed model artifacts, scalers, category mapping, and inference graph into memory once. The API then exposes four active routes:

- `GET /`
- `POST /find_route`
- `POST /select_best_route`
- `POST /live_track`

### ML Core: PyTorch Geometric GNN

The repository contains one deployed ML model: `RobustSupplyChainSAGE`. It is trained in `supply-chain-api/train.py` as an edge-regression model over the supply-chain graph. Node features are `avg_sales`, `avg_profit`, and `dominant_category_id`. Edge features include distance, cross-border status, cyclical dispatch-time features, scheduled shipping days, shipping preference encoding, quantity, physical mode encoding, and a 50-class product-category one-hot vector. The training target is non-negative shipment delay, computed as:

```text
delay = max(real_shipping_days - scheduled_shipping_days, 0)
```

At runtime, the predicted delay is added to a physics baseline:

- `Truck`: `(distance_km * 1.28) / (70 * 24) + 0.5`
- `Air`: `distance_km / (800 * 24) + 0.5`
- `Ocean`: `distance_km / (35 * 24) + 2.0`

This produces the effective routing weight used by the graph search engine.

### Agentic Core: LangGraph + Gemini + Live APIs

`supply-chain-api/risk_engine.py` compiles a LangGraph with a `master_risk` node and a `fusion` node. The engine fetches live weather per city from OpenWeatherMap, batches logistics and geopolitical news lookups through GNews, optionally injects synthetic disruptions, and prompts Gemini (`gemini-3.1-flash-lite-preview`) to return structured JSON risk maps. A fusion step combines weather, logistics, and geopolitical components into the final per-city risk snapshot used by the Chaos Simulator and live re-routing flow. A second Gemini model instance in `main_old.py` is dedicated to route-option selection via `/select_best_route`.

### Persistence and Operations

The frontend uses Firebase Authentication for login/registration and Cloud Firestore for shipment persistence. Saved shipments track route choice, live node risks, AI recommendation text, route progress, and reroute flags. Deployment scripts target Google Cloud Run for the API, Vercel for the frontend, and Firebase rules/index deployment for Firestore.

## Local Setup & Installation

### Prerequisites

- Python 3.11 recommended
- Node.js 16 or newer
- An OpenWeatherMap API key
- A GNews API key
- A Gemini API key
- A Firebase project for Auth + Firestore

### 1. Clone the repository

```bash
git clone https://github.com/Aayush-Bhargav/smart-supply-chain.git
cd "Google Hackathon - Smart Supply Chain"
```

### 2. Start the FastAPI backend

```bash
cd supply-chain-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend boots directly from the committed artifacts already present in `supply-chain-api/`, including:

- `supply_chain_model.pth`
- `node_scaler.pkl`
- `edge_scaler.pkl`
- `nodes_inference.json`
- `edges_inference.json`
- `category_mapping.json`

That means judges can run the demo without re-generating the graph or retraining the model first.

### 3. Configure and start the Next.js frontend

Open a new terminal:

```bash
cd "Google Hackathon - Smart Supply Chain/supply-chain-frontend"
npm install
npm run dev
```

The frontend expects a manually created `supply-chain-frontend/.env.local` file populated with the variables listed below.

### 4. Open the app

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## Environment Variables

### Backend: `supply-chain-api/.env`

| Variable | Example Value | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | Switches local vs production behavior. |
| `PORT` | `8000` | Runtime port used by FastAPI/Gunicorn. |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS allowlist for the frontend. |
| `GEMINI_API_KEY` | `your_gemini_api_key` | Used by both the risk engine and route-selection endpoint. |
| `OPENWEATHER_API_KEY` | `your_openweather_api_key` | Used by the live weather risk fetcher. |
| `GNEWS_API_KEY` | `your_gnews_api_key` | Used by the logistics and geopolitical news fetcher. |

### Frontend: `supply-chain-frontend/.env.local`

| Variable | Example Value | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Base URL for all frontend-to-backend API calls. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `your_firebase_api_key` | Firebase web app config. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` | Firebase Auth domain. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `your-project-id` | Firestore project ID. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` | Firebase Storage bucket. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `1234567890` | Firebase messaging sender ID. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:1234567890:web:abcdef123456` | Firebase application ID. |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `G-ABCDEFG123` | Firebase Analytics measurement ID. |

### Optional deployment variables

These are used by the deployment scripts rather than local runtime:

| Variable | Example Value | Used By |
| --- | --- | --- |
| `PROJECT_ID` | `your-gcp-project-id` | `supply-chain-api/deploy.sh` and `deploy-all.sh` |
| `REGION` | `us-central1` | Google Cloud Run deployment |
| `SERVICE` | `smart-supply-chain-api` | Google Cloud Run service name |
| `FIREBASE_PROJECT_ID` | `your-firebase-project-id` | Firebase deploy workflow |

## API Endpoints Summary

| Method | Path | What It Does |
| --- | --- | --- |
| `GET` | `/` | Health check that returns backend status plus loaded graph counts for nodes, edges, and categories. |
| `POST` | `/find_route` | Builds request-specific edge features, runs the GNN across the inference graph, applies physics and optional mock-disruption penalties, generates candidate paths, and returns the top route options with carbon metrics. |
| `POST` | `/select_best_route` | Sends the returned route options plus shipment priority and any available node-risk payload to Gemini, then returns a structured recommendation, executive summary, and trade-off bullets. |
| `POST` | `/live_track` | Re-evaluates the remaining route for an in-transit shipment, assesses future-city risk, and returns either a no-reroute response or a fresh alternate route preview. |

## Tech Stack

- Frontend: Next.js 14, React 18, TypeScript, Tailwind CSS, Lucide React
- Mapping and visualization: React Leaflet, Leaflet, OpenStreetMap tiles
- Backend API: FastAPI, Uvicorn, Gunicorn, Pydantic, Requests, python-dotenv
- Routing engine: NetworkX
- ML and graph learning: PyTorch, PyTorch Geometric, scikit-learn, joblib, NumPy
- Data pipeline and graph generation: pandas, geopy (Nominatim geocoding), scikit-learn NearestNeighbors
- Agentic AI: Google Gemini via `google-generativeai`, LangGraph
- Live external signals: OpenWeatherMap, GNews
- Auth and persistence: Firebase Authentication, Cloud Firestore
- Cloud and deployment: Google Cloud Run, Docker, Vercel, Firebase CLI for Firestore rules and indexes

## 
