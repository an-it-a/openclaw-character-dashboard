#!/usr/bin/env bash
# =============================================================================
# OpenClaw Character Dashboard — Docker Build & Run Helper
# =============================================================================
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── Build Check ──────────────────────────────────────────────────────────────
header "Step 1: Building the project..."
info "Generating fresh 'dist' folder to ensure Port 3001 works..."

if ! npm run build; then
    error "Build failed! Please check the errors above."
    exit 1
fi
success "Build complete."

# ── Docker Compose ───────────────────────────────────────────────────────────
header "Step 2: Starting Docker containers..."
info "Running in foreground (Press Ctrl+C to stop)..."

# Ensure clean state
docker compose down

# Start in foreground
docker compose up --build
