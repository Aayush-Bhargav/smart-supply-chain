#!/bin/bash

echo "🚀 Setting up Supply Chain Frontend..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "16" ]; then
    echo "❌ Node.js version 16 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
    echo ""
    echo "🎯 Next steps:"
    echo "1. Copy the example env file: cp .env.example .env.local"
    echo "2. Set NEXT_PUBLIC_API_BASE_URL and your Firebase values in .env.local"
    echo "3. Start your API server: cd ../supply-chain-api && uvicorn main:app --host 0.0.0.0 --port 8000"
    echo "4. Start the frontend: npm run dev"
    echo "5. Open: http://localhost:3000"
    echo ""
    echo "🌐 The frontend will connect using NEXT_PUBLIC_API_BASE_URL"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi
