#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting full deployment of Smart Supply Chain..."

# ======================
# 1. Load all variables
# ======================
set -a
source supply-chain-api/.env          # your Gemini, OpenWeather, GNews keys
source .env.deploy 2>/dev/null || true   # non-secret config (will be created below)
set +a

# ======================
# 2. Backend → Cloud Run
# ======================
echo "📦 Deploying Backend to Cloud Run..."
cd supply-chain-api
bash deploy.sh
cd ..

# Capture the latest backend URL
export BACKEND_URL=$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)')

echo "✅ Backend deployed → $BACKEND_URL"

# ======================
# 3. Frontend → Vercel
# ======================
echo "🌐 Deploying Frontend to Vercel..."
cd supply-chain-frontend
vercel --prod
cd ..

echo "✅ Frontend deployed"

# ======================
# 4. Firestore Rules & Indexes
# ======================
echo "🔒 Deploying Firestore rules & indexes..."
cd supply-chain-frontend
firebase deploy --only firestore:rules,firestore:indexes --project "solution-challenge-c6fea" --non-interactive
cd ..

echo "🎉 FULL DEPLOYMENT COMPLETE!"
echo "Frontend URL : $FRONTEND_URL"
echo "Backend URL  : $BACKEND_URL"