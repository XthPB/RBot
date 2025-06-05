#!/bin/bash

echo "🚀 WhatsApp Multi-Bot System - Railway Deployment"
echo "================================================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Login to Railway
echo "🔐 Please login to Railway..."
railway login

# Create new project
echo "🆕 Creating new Railway project..."
railway new

# Set environment variables
echo "⚙️ Setting up environment variables..."
echo ""
echo "🔔 IMPORTANT: You need to set these environment variables in Railway dashboard:"
echo "   MONGODB_URI=your_mongodb_connection_string"
echo "   NODE_ENV=production"
echo "   PORT=3000"
echo ""
echo "📝 Steps to add environment variables:"
echo "   1. Go to Railway dashboard"
echo "   2. Click on your project"
echo "   3. Go to Variables tab"
echo "   4. Add the variables above"
echo ""

# Deploy
echo "🚀 Deploying to Railway..."
railway up

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "📋 Next steps:"
echo "   1. Set environment variables in Railway dashboard"
echo "   2. Check deployment logs in Railway dashboard"
echo "   3. Your app will be available at: https://your-project-name.railway.app"
echo ""
echo "🎉 Once deployed, users can register at your Railway URL!"
