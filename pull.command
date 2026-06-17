#!/bin/bash
# Navigate to the folder where the script is located
cd "$(dirname "$0")"

echo "🚀 Syncing jxnn.store..."

git add .
git commit -m "Mac Update: $(date)" || true

echo "📥 Pulling changes from GitHub..."
git pull origin main --rebase

echo "📤 Uploading to GitHub..."
git push origin main

echo "✅ Sync Complete!"
sleep 3