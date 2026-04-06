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
    echo "1. Start your API server: cd ../supply-chain-api && python main.py"
    echo "2. Start the frontend: npm run dev"
    echo "3. Open: http://localhost:3000"
    echo ""
    echo "🌐 The frontend will connect to: http://localhost:8000/find_route"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi
