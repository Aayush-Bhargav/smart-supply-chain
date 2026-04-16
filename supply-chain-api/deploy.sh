#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-smart-supply-chain-api}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3000}"

required_vars=(
  PROJECT_ID
  GEMINI_API_KEY
  OPENWEATHER_API_KEY
  GNEWS_API_KEY
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

echo "🚀 Deploying ${SERVICE} to Cloud Run in ${REGION}..."
gcloud config set project "${PROJECT_ID}"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

gcloud run deploy "${SERVICE}" \
  --source "${SCRIPT_DIR}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --concurrency 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 2 \
  --port 8080 \
  --set-env-vars "ENVIRONMENT=production,ALLOWED_ORIGINS=${ALLOWED_ORIGINS},GEMINI_API_KEY=${GEMINI_API_KEY},OPENWEATHER_API_KEY=${OPENWEATHER_API_KEY},GNEWS_API_KEY=${GNEWS_API_KEY}"

echo "✅ Deployment complete."
echo "🌐 Service URL:"
gcloud run services describe "${SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format='value(status.url)'
