#!/bin/bash

# Google Cloud Deployment Script for Supply Chain API

echo "🚀 Starting Google Cloud Deployment..."

# Set your project ID
PROJECT_ID="your-project-id-here"
echo "Setting project: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "📋 Enabling required APIs..."
gcloud services enable appengine.googleapis.com
gcloud services enable cloudbuild.googleapis.com

# Clean git to avoid large file issues
echo "🧹 Cleaning git history..."
git reset --soft HEAD~1  # Undo last commit but keep changes
git add .
git commit -m "Deployment ready - excluding large files"

# Deploy to App Engine
echo "🌐 Deploying to Google Cloud App Engine..."
gcloud app deploy --quiet

echo "✅ Deployment complete!"
echo "📍 Your API is now live at: https://$PROJECT_ID.appspot.com"
echo ""
echo "📝 Test your API with:"
echo "curl -X POST https://$PROJECT_ID.appspot.com/find_route \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{"
echo "    \"source_city\": \"New York\","
echo "    \"target_city\": \"Los Angeles\","
echo "    \"category_name\": \"Men's Clothing\","
echo "    \"quantity\": 5,"
echo "    \"priority_level\": \"Standard Class\","
echo "    \"dispatch_date\": \"2026-04-03T14:30:00\""
echo "  }'"
