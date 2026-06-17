#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh"; fi
echo "Starting OpenClaw Character Dashboard (frontend + API server)..."
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop."
exec npm run dev:all --prefix "$PROJECT_DIR"
