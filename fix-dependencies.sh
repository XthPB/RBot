#!/bin/bash

echo "🔧 Fixing NPM Dependencies and Lock File"
echo "========================================"

# Remove existing lock file and node_modules
echo "🗑️ Cleaning up old dependencies..."
rm -rf package-lock.json
rm -rf node_modules

# Remove whatsapp-web.js related files if they exist
echo "🧹 Removing old WhatsApp Web files..."
rm -rf .wwebjs_auth*

# Install fresh dependencies
echo "📦 Installing fresh dependencies..."
npm install

# Verify installation
echo "✅ Verifying installation..."
if [ -f "package-lock.json" ]; then
    echo "✅ package-lock.json created successfully"
else
    echo "❌ Failed to create package-lock.json"
    exit 1
fi

# Check if key dependencies are installed
echo "🔍 Checking key dependencies..."
if npm list @whiskeysockets/baileys >/dev/null 2>&1; then
    echo "✅ @whiskeysockets/baileys - OK"
else
    echo "❌ @whiskeysockets/baileys - Missing"
fi

if npm list express >/dev/null 2>&1; then
    echo "✅ express - OK"
else
    echo "❌ express - Missing"
fi

if npm list mongoose >/dev/null 2>&1; then
    echo "✅ mongoose - OK"
else
    echo "❌ mongoose - Missing"
fi

if npm list qrcode >/dev/null 2>&1; then
    echo "✅ qrcode - OK"
else
    echo "❌ qrcode - Missing"
fi

echo ""
echo "🎉 Dependencies fixed!"
echo "📋 Next steps:"
echo "   1. Commit the new package-lock.json"
echo "   2. Push to trigger GitHub Actions"
echo "   3. Deploy to Railway"
echo ""
echo "💡 GitHub Actions should now pass with 'npm ci'"
