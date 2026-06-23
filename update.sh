#!/bin/bash

# ═══════════════════════════════════════════════════════════
#  WebCake CMS MCP Server - Updater
# ═══════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

DEFAULT_INSTALL_DIR="$HOME/.webcake-storefront-mcp"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}WebCake CMS MCP Server - Updater${NC}               ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Determine install directory ──

INSTALL_DIR="${1:-}"

if [ -z "$INSTALL_DIR" ]; then
  # Try to auto-detect: check default dir, then current dir
  if [ -d "$DEFAULT_INSTALL_DIR" ] && [ -f "$DEFAULT_INSTALL_DIR/index.js" ]; then
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
  elif [ -f "./index.js" ] && [ -f "./api.js" ]; then
    INSTALL_DIR="$(pwd)"
  else
    error "Could not find MCP server installation."
    echo ""
    echo "  Usage: ./update.sh [install-path]"
    echo "  Example: ./update.sh ~/.webcake-storefront-mcp"
    echo ""
    exit 1
  fi
fi

INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

if [ ! -f "$INSTALL_DIR/index.js" ]; then
  error "No MCP server found at $INSTALL_DIR"
  exit 1
fi

info "MCP server found at ${BOLD}$INSTALL_DIR${NC}"

# ── Save current version info ──

cd "$INSTALL_DIR"

CURRENT_COMMIT=""
if [ -d ".git" ]; then
  CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  info "Current version: $CURRENT_COMMIT"
fi

# ── Pull latest changes ──

if [ -d ".git" ]; then
  info "Pulling latest changes..."

  # Check for local modifications
  if ! git diff --quiet 2>/dev/null; then
    warn "Local modifications detected"
    echo ""
    echo "  1) Stash changes and update"
    echo "  2) Force update (discard local changes)"
    echo "  3) Cancel"
    echo ""
    read -rp "  Choose [1]: " CHOICE < /dev/tty
    CHOICE="${CHOICE:-1}"

    case "$CHOICE" in
      1)
        git stash
        success "Changes stashed (restore with: git stash pop)"
        ;;
      2)
        git checkout .
        success "Local changes discarded"
        ;;
      3)
        info "Update cancelled."
        exit 0
        ;;
      *)
        error "Invalid choice"
        exit 1
        ;;
    esac
  fi

  git pull origin main 2>/dev/null || git pull 2>/dev/null
  NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

  if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
    success "Already up to date ($NEW_COMMIT)"
  else
    success "Updated: $CURRENT_COMMIT → $NEW_COMMIT"

    # Show what changed
    if [ "$CURRENT_COMMIT" != "unknown" ] && [ "$NEW_COMMIT" != "unknown" ]; then
      echo ""
      info "Changes:"
      git log --oneline "$CURRENT_COMMIT".."$NEW_COMMIT" 2>/dev/null | head -20 | while read -r line; do
        echo "  $line"
      done
    fi
  fi
else
  warn "Not a git repo — cannot pull updates."
  echo "  To enable updates, re-install from git:"
  echo "  git clone https://github.com/vuluu2k/webcake-storefront-mcp.git $INSTALL_DIR"
  exit 1
fi

# ── Reinstall dependencies ──

info "Installing dependencies..."
npm install --production 2>&1 | tail -1
success "Dependencies updated"

# ── Verify ──

info "Verifying..."
node --check "$INSTALL_DIR/index.js" 2>/dev/null && success "Syntax OK" || warn "Syntax check failed"

# ── Done ──

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Update Complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Restart your IDE to use the new version.${NC}"
echo ""
