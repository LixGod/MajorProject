#!/bin/bash
# Smart Traffic System — Backend Startup Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================="
echo "  Smart Traffic System — Detection Backend"
echo "============================================="

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found. Please install Python 3.8+"
    exit 1
fi

# Create and activate venv if not already present
if [ ! -d "venv" ]; then
    echo "[*] Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
echo "[*] Virtual environment active"

# Install deps
echo "[*] Installing/verifying dependencies..."
pip install --quiet -r requirements.txt

# Copy model if not present in backend dir
if [ ! -f "best.pt" ] && [ -f "../best.pt" ]; then
    echo "[*] Model found at ../best.pt (will be used automatically)"
fi

echo "[*] Starting Flask server on http://localhost:5050"
echo "[*] Press Ctrl+C to stop"
echo "---------------------------------------------"

PORT=5050 python3 app.py
