#!/usr/bin/env bash
# =============================================================================
# OpenClaw Character Dashboard — Installer (macOS / Linux)
# =============================================================================
set -euo pipefail

REQUIRED_NODE_MAJOR=22
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── OS detection ─────────────────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin) echo "mac" ;;
    Linux)  echo "linux" ;;
    *)      echo "unknown" ;;
  esac
}

OS=$(detect_os)

# ── Ask yes/no ───────────────────────────────────────────────────────────────
ask() {
  # ask <prompt> — returns 0 for yes, 1 for no
  local prompt="$1"
  while true; do
    read -rp "$(echo -e "${YELLOW}${prompt}${RESET} [Y/n] ")" answer
    case "${answer:-Y}" in
      [Yy]*) return 0 ;;
      [Nn]*) return 1 ;;
      *)     warn "Please answer Y or n." ;;
    esac
  done
}

# ── Node.js version helpers ───────────────────────────────────────────────────
node_major() {
  node --version 2>/dev/null | sed 's/v//' | cut -d. -f1
}

node_ok() {
  command -v node &>/dev/null && [[ "$(node_major)" -ge "$REQUIRED_NODE_MAJOR" ]]
}

npm_ok() {
  command -v npm &>/dev/null
}

# ── Install / upgrade Node.js ─────────────────────────────────────────────────
install_node_mac() {
  # Prefer nvm; fall back to Homebrew.
  if command -v nvm &>/dev/null || [ -s "$HOME/.nvm/nvm.sh" ]; then
    info "Using nvm to install Node.js $REQUIRED_NODE_MAJOR..."
    # shellcheck source=/dev/null
    [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
    nvm install "$REQUIRED_NODE_MAJOR"
    nvm use "$REQUIRED_NODE_MAJOR"
    nvm alias default "$REQUIRED_NODE_MAJOR"
  elif command -v brew &>/dev/null; then
    info "Using Homebrew to install Node.js..."
    brew install node@"$REQUIRED_NODE_MAJOR" || brew upgrade node
    # Homebrew may need the bin linked
    brew link --overwrite node@"$REQUIRED_NODE_MAJOR" 2>/dev/null || true
  else
    error "Neither nvm nor Homebrew is available."
    echo -e "Install Node.js $REQUIRED_NODE_MAJOR manually from: ${CYAN}https://nodejs.org${RESET}"
    exit 1
  fi
}

install_node_linux() {
  if command -v nvm &>/dev/null || [ -s "$HOME/.nvm/nvm.sh" ]; then
    info "Using nvm to install Node.js $REQUIRED_NODE_MAJOR..."
    # shellcheck source=/dev/null
    [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
    nvm install "$REQUIRED_NODE_MAJOR"
    nvm use "$REQUIRED_NODE_MAJOR"
    nvm alias default "$REQUIRED_NODE_MAJOR"
  elif command -v apt-get &>/dev/null; then
    info "Installing Node.js $REQUIRED_NODE_MAJOR via NodeSource (apt)..."
    curl -fsSL "https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    info "Installing Node.js $REQUIRED_NODE_MAJOR via NodeSource (dnf)..."
    curl -fsSL "https://rpm.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x" | sudo bash -
    sudo dnf install -y nodejs
  elif command -v yum &>/dev/null; then
    info "Installing Node.js $REQUIRED_NODE_MAJOR via NodeSource (yum)..."
    curl -fsSL "https://rpm.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x" | sudo bash -
    sudo yum install -y nodejs
  else
    error "Could not find a supported package manager (apt, dnf, yum) or nvm."
    echo -e "Install Node.js $REQUIRED_NODE_MAJOR manually from: ${CYAN}https://nodejs.org${RESET}"
    exit 1
  fi
}

ensure_node() {
  header "Checking Node.js..."

  if node_ok; then
    success "Node.js $(node --version) found — meets requirement (>= v${REQUIRED_NODE_MAJOR})."
    return
  fi

  if command -v node &>/dev/null; then
    current="$(node --version)"
    warn "Node.js ${current} is installed but version >= v${REQUIRED_NODE_MAJOR} is required."
    if ask "Upgrade Node.js to v${REQUIRED_NODE_MAJOR}?"; then
      [[ "$OS" == "mac" ]] && install_node_mac || install_node_linux
    else
      error "Node.js upgrade skipped. Cannot continue."
      exit 1
    fi
  else
    warn "Node.js is not installed."
    if ask "Install Node.js v${REQUIRED_NODE_MAJOR}?"; then
      [[ "$OS" == "mac" ]] && install_node_mac || install_node_linux
    else
      error "Node.js installation skipped. Cannot continue."
      exit 1
    fi
  fi

  # Re-source shell in case PATH changed
  if [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh"; fi

  if ! node_ok; then
    error "Node.js installation did not succeed or PATH was not updated."
    echo "Please open a new terminal and re-run this installer."
    exit 1
  fi
  success "Node.js $(node --version) ready."
}

ensure_npm() {
  header "Checking npm..."
  if npm_ok; then
    success "npm $(npm --version) found."
  else
    error "npm is not available. It should come bundled with Node.js."
    echo "Try reinstalling Node.js from https://nodejs.org"
    exit 1
  fi
}

# ── .env setup ────────────────────────────────────────────────────────────────
setup_env() {
  header "Setting up environment file..."
  if [ ! -f "$PROJECT_DIR/.env" ] && [ ! -f "$PROJECT_DIR/.env.local" ]; then
    if [ -f "$PROJECT_DIR/.env.example" ]; then
      cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env.local"
      success "Created .env.local from .env.example — edit it to customise settings."
    fi
  else
    info ".env / .env.local already exists — skipping."
  fi
}

# ── npm install ───────────────────────────────────────────────────────────────
run_npm_install() {
  header "Installing dependencies..."
  npm install --prefix "$PROJECT_DIR"
  success "Dependencies installed."
}

# ── Create runner scripts ─────────────────────────────────────────────────────
create_runners() {
  header "Creating runner scripts..."

  # run.sh — full stack (frontend + API server)
  cat > "$PROJECT_DIR/run.sh" <<'RUNNER'
#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh"; fi
echo "Starting OpenClaw Character Dashboard (frontend + API server)..."
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop."
exec npm run dev:all --prefix "$PROJECT_DIR"
RUNNER

  chmod +x "$PROJECT_DIR/run.sh"
  success "Created run.sh"
}

# ── Summary ───────────────────────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
  echo -e "${GREEN}${BOLD}║   OpenClaw Character Dashboard — Ready to launch!   ║${RESET}"
  echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  ${BOLD}To start the dashboard, run:${RESET}"
  echo ""
  echo -e "    ${CYAN}./run.sh${RESET}          # frontend + API server (recommended)"
  echo -e "    ${CYAN}npm run dev${RESET}       # frontend only"
  echo -e "    ${CYAN}npm run dev:all${RESET}   # same as ./run.sh"
  echo ""
  echo -e "  ${BOLD}Then open your browser at:${RESET}  ${CYAN}http://localhost:5173${RESET}"
  echo ""
  echo -e "  ${BOLD}Optional:${RESET} edit ${CYAN}.env.local${RESET} to point at your OpenClaw data."
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  echo -e "${BOLD}OpenClaw Character Dashboard — Installer${RESET}"
  echo "Platform: $OS"
  echo ""

  if [[ "$OS" == "unknown" ]]; then
    error "Unsupported OS: $(uname -s). Use install.bat / install.ps1 on Windows."
    exit 1
  fi

  ensure_node
  ensure_npm
  setup_env
  run_npm_install
  create_runners
  print_summary
}

main "$@"
