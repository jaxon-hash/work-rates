#!/bin/bash
cd "$(dirname "$0")"
echo "Updating portfolio from GitHub..."
git pull origin main
echo "Done!"
sleep 2