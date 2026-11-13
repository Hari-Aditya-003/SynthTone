#!/usr/bin/env bash
# ==============================================================================
# SynthTone — Dell GPU Server Quickstart Script
# ==============================================================================
set -e

echo "◈ Starting SynthTone on Dell GPU Server..."

if [ ! -f .env ]; then
  echo "Generating initial .env configuration..."
  cp .env.example .env
  KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))' 2>/dev/null || openssl rand -base64 24)
  sed -i "s/REPLACE_WITH_A_LONG_RANDOM_SECRET/$KEY/" .env 2>/dev/null || sed -i '' "s/REPLACE_WITH_A_LONG_RANDOM_SECRET/$KEY/" .env
  echo "✓ Generated new random SYNTHTONE_API_KEY in .env"
fi

if command -v nvidia-smi &> /dev/null; then
  echo "✓ NVIDIA GPU detected:"
  nvidia-smi --query-gpu=gpu_name,memory.total,driver_version --format=csv,noheader
else
  echo "ℹ No direct nvidia-smi detected. Running with host/CPU configuration."
fi

docker compose build
docker compose up -d

echo ""
echo "=============================================================================="
echo "✓ SynthTone is live at http://127.0.0.1:8000"
echo "  To view logs: docker compose logs -f synthtone"
echo "  To access from your MacBook over LAN or Tailscale:"
echo "    ssh -L 8000:127.0.0.1:8000 <dell-user>@<dell-ip>"
echo "=============================================================================="

