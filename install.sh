#!/bin/bash

# ═══════════════════════════════════════════════════════════
#  WebCake CMS MCP Server - Auto Installer
#  Supports: Claude Desktop, Claude Code, Cursor, Windsurf, Augment, Codex
# ═══════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

print_banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  ${BOLD}WebCake CMS MCP Server - Installer${NC}             ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  Claude Desktop, Claude Code, Cursor, Windsurf...${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
}

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Check prerequisites ──

install_node() {
  # Detect OS and install Node.js 20 LTS
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &> /dev/null; then
      info "Installing Node.js via Homebrew..."
      brew install node@20
      brew link --overwrite node@20 2>/dev/null || brew link --force node@20 2>/dev/null || true
    else
      info "Installing Homebrew first..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      # Load brew into current shell
      if [ -f "/opt/homebrew/bin/brew" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
      elif [ -f "/usr/local/bin/brew" ]; then
        eval "$(/usr/local/bin/brew shellenv)"
      fi
      brew install node@20
      brew link --overwrite node@20 2>/dev/null || brew link --force node@20 2>/dev/null || true
    fi
  elif command -v apt-get &> /dev/null; then
    info "Installing Node.js 20 via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v yum &> /dev/null; then
    info "Installing Node.js 20 via NodeSource..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
  else
    error "Cannot auto-install Node.js on this OS."
    echo "  Please install manually: https://nodejs.org/"
    exit 1
  fi

  # Verify
  if ! command -v node &> /dev/null; then
    error "Node.js installation failed."
    echo "  Please install manually: https://nodejs.org/"
    exit 1
  fi
  success "Node.js $(node -v) installed successfully"
}

check_node() {
  local NEED_INSTALL=false

  if ! command -v node &> /dev/null; then
    warn "Node.js is not installed."
    NEED_INSTALL=true
  else
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
      warn "Node.js >= 18 required. Current: $(node -v)"
      NEED_INSTALL=true
    fi
  fi

  if [ "$NEED_INSTALL" = true ]; then
    echo ""
    read -rp "  Install Node.js 20 LTS automatically? (Y/n): " INSTALL_NODE < /dev/tty
    INSTALL_NODE="${INSTALL_NODE:-Y}"
    if [[ "$INSTALL_NODE" =~ ^[Yy]$ ]]; then
      install_node
    else
      error "Node.js >= 18 is required. Install it and try again."
      echo "  https://nodejs.org/"
      exit 1
    fi
  fi

  # Resolve absolute path to node binary
  # GUI apps (Claude Desktop, Cursor...) don't load shell profiles,
  # so "node" alone may find a wrong version or not found at all.
  # We detect the real binary path to write into IDE configs.
  NODE_BIN="$(which node)"

  case "$NODE_BIN" in
    /*) ;; # already absolute — good
    *)  NODE_BIN="/usr/local/bin/node" ;; # fallback
  esac

  success "Node.js $(node -v) at ${BOLD}$NODE_BIN${NC}"
}

check_npm() {
  if ! command -v npm &> /dev/null; then
    error "npm is not installed."
    exit 1
  fi
  success "npm $(npm -v) detected"
}

# ── Install MCP server ──

REPO_URL="https://github.com/vuluu2k/webcake-storefront-mcp.git"
DEFAULT_INSTALL_DIR="$HOME/.webcake-storefront-mcp"

install_mcp() {
  echo ""
  info "Where to install the MCP server?"
  echo -e "  Default: ${BOLD}$DEFAULT_INSTALL_DIR${NC}"
  read -rp "  Install path (Enter for default): " INSTALL_DIR < /dev/tty
  INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

  # Expand ~ if user typed it
  INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

  if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/index.js" ]; then
    success "MCP server already exists at $INSTALL_DIR"
    read -rp "  Update to latest version? (y/N): " UPDATE < /dev/tty
    if [[ "$UPDATE" =~ ^[Yy]$ ]]; then
      info "Updating..."
      cd "$INSTALL_DIR"
      git pull origin main 2>/dev/null || git pull 2>/dev/null || warn "Git pull failed, continuing with existing version"
      npm install --production
      success "Updated successfully"
      cd - > /dev/null
    fi
  else
    info "Cloning repository..."
    if command -v git &> /dev/null; then
      git clone "$REPO_URL" "$INSTALL_DIR"
    else
      warn "git not found. Downloading via npm instead..."
      mkdir -p "$INSTALL_DIR"
      # Fallback: copy from current directory if running from repo
      SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
      if [ -f "$SCRIPT_DIR/index.js" ]; then
        cp "$SCRIPT_DIR/index.js" "$INSTALL_DIR/"
        cp "$SCRIPT_DIR/api.js" "$INSTALL_DIR/"
        cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
      else
        error "Cannot install without git. Please install git first."
        exit 1
      fi
    fi

    info "Installing dependencies..."
    cd "$INSTALL_DIR"
    npm install --production
    cd - > /dev/null
    success "MCP server installed at $INSTALL_DIR"
  fi

  MCP_INDEX="$INSTALL_DIR/index.js"
}

# ── Collect environment variables ──

collect_env() {
  echo ""
  echo -e "${BOLD}── Environment Configuration ──${NC}"
  echo ""
  echo -e "  ${YELLOW}How to get token & session_id:${NC}"
  echo "    1. Login to WebCake/StoreCake dashboard"
  echo "    2. Open DevTools (F12) > Network tab"
  echo "    3. Click any page, find an API request"
  echo "    4. Copy 'Authorization: Bearer ...' header value → token"
  echo "    5. Copy 'x-session-id' header value → session_id"
  echo ""

  # API URL
  read -rp "  WEBCAKE_API_URL [https://api.storecake.io]: " API_URL < /dev/tty
  API_URL="${API_URL:-https://api.storecake.io}"

  # Token (optional — can set later via update_auth tool)
  read -rp "  WEBCAKE_TOKEN (JWT token, Enter to skip): " TOKEN < /dev/tty
  TOKEN="${TOKEN:-}"

  # Session ID
  read -rp "  WEBCAKE_SESSION_ID (x-session-id, Enter to skip): " SESSION_ID < /dev/tty
  SESSION_ID="${SESSION_ID:-}"

  # Site ID (optional — can set later via switch_site tool)
  read -rp "  WEBCAKE_SITE_ID (Enter to skip — choose later via AI): " SITE_ID < /dev/tty
  SITE_ID="${SITE_ID:-}"

  echo ""
  success "Configuration:"
  echo "  API URL    : $API_URL"
  if [ -n "$TOKEN" ]; then
    echo "  Token      : ${TOKEN:0:20}..."
  else
    echo -e "  Token      : ${YELLOW}(not set — use update_auth tool later)${NC}"
  fi
  if [ -n "$SESSION_ID" ]; then
    echo "  Session ID : ${SESSION_ID:0:12}..."
  else
    echo -e "  Session ID : ${YELLOW}(not set — use update_auth tool later)${NC}"
  fi
  if [ -n "$SITE_ID" ]; then
    echo "  Site ID    : $SITE_ID"
  else
    echo -e "  Site ID    : ${YELLOW}(not set — use switch_site tool later)${NC}"
  fi
}

# ── IDE Configuration ──

configure_claude_code() {
  info "Configuring Claude Code..."

  if command -v claude &> /dev/null; then
    claude mcp add webcake-cms \
      -e WEBCAKE_API_URL="$API_URL" \
      -e WEBCAKE_TOKEN="$TOKEN" \
      -e WEBCAKE_SESSION_ID="$SESSION_ID" \
      -e WEBCAKE_SITE_ID="$SITE_ID" \
      -- "$NODE_BIN" "$MCP_INDEX"
    success "Claude Code configured (via CLI)"
  else
    # Fallback: write to ~/.claude.json
    CLAUDE_CONFIG="$HOME/.claude.json"
    if [ -f "$CLAUDE_CONFIG" ]; then
      # Check if file has content
      if [ -s "$CLAUDE_CONFIG" ]; then
        # Use node to merge config
        node -e "
          const fs = require('fs');
          const config = JSON.parse(fs.readFileSync('$CLAUDE_CONFIG', 'utf8'));
          if (!config.mcpServers) config.mcpServers = {};
          config.mcpServers['webcake-cms'] = {
            command: '$NODE_BIN',
            args: ['$MCP_INDEX'],
            env: {
              WEBCAKE_API_URL: '$API_URL',
              WEBCAKE_TOKEN: '$TOKEN',
              WEBCAKE_SESSION_ID: '$SESSION_ID',
              WEBCAKE_SITE_ID: '$SITE_ID'
            }
          };
          fs.writeFileSync('$CLAUDE_CONFIG', JSON.stringify(config, null, 2));
        "
      else
        write_claude_config
      fi
    else
      write_claude_config
    fi
    success "Claude Code configured ($CLAUDE_CONFIG)"
  fi
}

write_claude_config() {
  cat > "$CLAUDE_CONFIG" << JSONEOF
{
  "mcpServers": {
    "webcake-cms": {
      "command": "$NODE_BIN",
      "args": ["$MCP_INDEX"],
      "env": {
        "WEBCAKE_API_URL": "$API_URL",
        "WEBCAKE_TOKEN": "$TOKEN",
        "WEBCAKE_SESSION_ID": "$SESSION_ID",
        "WEBCAKE_SITE_ID": "$SITE_ID"
      }
    }
  }
}
JSONEOF
}

configure_claude_desktop() {
  info "Configuring Claude Desktop..."

  # macOS
  CLAUDE_DESKTOP_DIR="$HOME/Library/Application Support/Claude"
  # Linux
  if [ ! -d "$CLAUDE_DESKTOP_DIR" ]; then
    CLAUDE_DESKTOP_DIR="$HOME/.config/Claude"
  fi

  mkdir -p "$CLAUDE_DESKTOP_DIR"
  CLAUDE_DESKTOP_CONFIG="$CLAUDE_DESKTOP_DIR/claude_desktop_config.json"

  if [ -f "$CLAUDE_DESKTOP_CONFIG" ] && [ -s "$CLAUDE_DESKTOP_CONFIG" ]; then
    node -e "
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync('$CLAUDE_DESKTOP_CONFIG', 'utf8'));
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers['webcake-cms'] = {
        command: '$NODE_BIN',
        args: ['$MCP_INDEX'],
        env: {
          WEBCAKE_API_URL: '$API_URL',
          WEBCAKE_TOKEN: '$TOKEN',
          WEBCAKE_SESSION_ID: '$SESSION_ID',
          WEBCAKE_SITE_ID: '$SITE_ID'
        }
      };
      fs.writeFileSync('$CLAUDE_DESKTOP_CONFIG', JSON.stringify(config, null, 2));
    "
  else
    cat > "$CLAUDE_DESKTOP_CONFIG" << JSONEOF
{
  "mcpServers": {
    "webcake-cms": {
      "command": "$NODE_BIN",
      "args": ["$MCP_INDEX"],
      "env": {
        "WEBCAKE_API_URL": "$API_URL",
        "WEBCAKE_TOKEN": "$TOKEN",
        "WEBCAKE_SESSION_ID": "$SESSION_ID",
        "WEBCAKE_SITE_ID": "$SITE_ID"
      }
    }
  }
}
JSONEOF
  fi

  success "Claude Desktop configured ($CLAUDE_DESKTOP_CONFIG)"
  warn "Restart Claude Desktop to activate"
}

configure_cursor() {
  info "Configuring Cursor..."

  CURSOR_DIR="$HOME/.cursor"
  mkdir -p "$CURSOR_DIR"
  CURSOR_CONFIG="$CURSOR_DIR/mcp.json"

  if [ -f "$CURSOR_CONFIG" ] && [ -s "$CURSOR_CONFIG" ]; then
    node -e "
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync('$CURSOR_CONFIG', 'utf8'));
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers['webcake-cms'] = {
        command: '$NODE_BIN',
        args: ['$MCP_INDEX'],
        env: {
          WEBCAKE_API_URL: '$API_URL',
          WEBCAKE_TOKEN: '$TOKEN',
          WEBCAKE_SESSION_ID: '$SESSION_ID',
          WEBCAKE_SITE_ID: '$SITE_ID'
        }
      };
      fs.writeFileSync('$CURSOR_CONFIG', JSON.stringify(config, null, 2));
    "
  else
    cat > "$CURSOR_CONFIG" << JSONEOF
{
  "mcpServers": {
    "webcake-cms": {
      "command": "$NODE_BIN",
      "args": ["$MCP_INDEX"],
      "env": {
        "WEBCAKE_API_URL": "$API_URL",
        "WEBCAKE_TOKEN": "$TOKEN",
        "WEBCAKE_SESSION_ID": "$SESSION_ID",
        "WEBCAKE_SITE_ID": "$SITE_ID"
      }
    }
  }
}
JSONEOF
  fi

  success "Cursor configured ($CURSOR_CONFIG)"
}

configure_windsurf() {
  info "Configuring Windsurf..."

  WINDSURF_DIR="$HOME/.codeium/windsurf"
  mkdir -p "$WINDSURF_DIR"
  WINDSURF_CONFIG="$WINDSURF_DIR/mcp_config.json"

  if [ -f "$WINDSURF_CONFIG" ] && [ -s "$WINDSURF_CONFIG" ]; then
    node -e "
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync('$WINDSURF_CONFIG', 'utf8'));
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers['webcake-cms'] = {
        command: '$NODE_BIN',
        args: ['$MCP_INDEX'],
        env: {
          WEBCAKE_API_URL: '$API_URL',
          WEBCAKE_TOKEN: '$TOKEN',
          WEBCAKE_SESSION_ID: '$SESSION_ID',
          WEBCAKE_SITE_ID: '$SITE_ID'
        }
      };
      fs.writeFileSync('$WINDSURF_CONFIG', JSON.stringify(config, null, 2));
    "
  else
    cat > "$WINDSURF_CONFIG" << JSONEOF
{
  "mcpServers": {
    "webcake-cms": {
      "command": "$NODE_BIN",
      "args": ["$MCP_INDEX"],
      "env": {
        "WEBCAKE_API_URL": "$API_URL",
        "WEBCAKE_TOKEN": "$TOKEN",
        "WEBCAKE_SESSION_ID": "$SESSION_ID",
        "WEBCAKE_SITE_ID": "$SITE_ID"
      }
    }
  }
}
JSONEOF
  fi

  success "Windsurf configured ($WINDSURF_CONFIG)"
}

configure_augment() {
  info "Configuring Augment (VS Code)..."

  # Augment uses VS Code settings
  VSCODE_DIR="$HOME/.vscode"
  if [ -d "$HOME/Library/Application Support/Code/User" ]; then
    VSCODE_DIR="$HOME/Library/Application Support/Code/User"
  elif [ -d "$HOME/.config/Code/User" ]; then
    VSCODE_DIR="$HOME/.config/Code/User"
  fi

  AUGMENT_CONFIG="$VSCODE_DIR/augment_mcp.json"
  mkdir -p "$VSCODE_DIR"

  cat > "$AUGMENT_CONFIG" << JSONEOF
{
  "mcpServers": {
    "webcake-cms": {
      "command": "$NODE_BIN",
      "args": ["$MCP_INDEX"],
      "env": {
        "WEBCAKE_API_URL": "$API_URL",
        "WEBCAKE_TOKEN": "$TOKEN",
        "WEBCAKE_SESSION_ID": "$SESSION_ID",
        "WEBCAKE_SITE_ID": "$SITE_ID"
      }
    }
  }
}
JSONEOF

  success "Augment config written to $AUGMENT_CONFIG"
  warn "Open VS Code > Cmd+Shift+P > 'Augment: Edit MCP Settings' and paste the config above"
}

configure_codex() {
  info "Configuring Codex (OpenAI)..."

  CODEX_DIR="$HOME/.codex"
  CODEX_CONFIG="$CODEX_DIR/config.toml"
  mkdir -p "$CODEX_DIR"

  # Build the TOML block for webcake-cms
  TOML_BLOCK=$(cat << TOMLEOF

[mcp_servers.webcake-cms]
command = "$NODE_BIN"
args = ["$MCP_INDEX"]
env = { "WEBCAKE_API_URL" = "$API_URL", "WEBCAKE_TOKEN" = "$TOKEN", "WEBCAKE_SESSION_ID" = "$SESSION_ID", "WEBCAKE_SITE_ID" = "$SITE_ID" }
TOMLEOF
)

  if [ -f "$CODEX_CONFIG" ]; then
    if grep -q '\[mcp_servers\.webcake-cms\]' "$CODEX_CONFIG" 2>/dev/null; then
      # Remove existing webcake-cms block (from [mcp_servers.webcake-cms] to next [section] or EOF)
      node -e "
        const fs = require('fs');
        let content = fs.readFileSync('$CODEX_CONFIG', 'utf8');
        content = content.replace(/\\n?\\[mcp_servers\\.webcake-cms\\][\\s\\S]*?(?=\\n\\[|$)/, '');
        fs.writeFileSync('$CODEX_CONFIG', content.trimEnd() + '\\n');
      " 2>/dev/null
      info "Replacing existing webcake-cms config..."
    fi
    echo "$TOML_BLOCK" >> "$CODEX_CONFIG"
  else
    echo "# WebCake CMS MCP Server" > "$CODEX_CONFIG"
    echo "$TOML_BLOCK" >> "$CODEX_CONFIG"
  fi

  success "Codex configured ($CODEX_CONFIG)"
}

# ── IDE Selection Menu ──

select_ides() {
  echo ""
  echo -e "${BOLD}── Select IDE/Tool to configure ──${NC}"
  echo ""
  echo "  1) Claude Desktop"
  echo "  2) Claude Code (CLI)"
  echo "  3) Cursor"
  echo "  4) Windsurf"
  echo "  5) Augment (VS Code)"
  echo "  6) Codex (OpenAI)"
  echo "  7) All of the above"
  echo "  0) Skip (manual setup later)"
  echo ""
  read -rp "  Choose (comma-separated, e.g. 1,2): " IDE_CHOICE < /dev/tty

  IFS=',' read -ra CHOICES <<< "$IDE_CHOICE"

  for choice in "${CHOICES[@]}"; do
    choice=$(echo "$choice" | tr -d ' ')
    case "$choice" in
      1) configure_claude_desktop ;;
      2) configure_claude_code ;;
      3) configure_cursor ;;
      4) configure_windsurf ;;
      5) configure_augment ;;
      6) configure_codex ;;
      7)
        configure_claude_desktop
        configure_claude_code
        configure_cursor
        configure_windsurf
        configure_augment
        configure_codex
        ;;
      0) info "Skipping IDE configuration." ;;
      *) warn "Unknown option: $choice" ;;
    esac
  done
}

# ── Verify installation ──

verify() {
  echo ""
  info "Verifying installation..."

  if node -e "import('$MCP_INDEX')" 2>/dev/null; then
    success "MCP server module loads correctly"
  else
    # Quick syntax check
    node --check "$MCP_INDEX" 2>/dev/null && success "MCP server syntax OK" || warn "Could not verify module (may need env vars to run)"
  fi
}

# ── Print summary ──

print_summary() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Installation Complete!${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Node.js    : ${BOLD}$NODE_BIN${NC}"
  echo -e "  MCP Server : ${BOLD}$MCP_INDEX${NC}"
  echo -e "  API URL    : $API_URL"
  if [ -n "$SITE_ID" ]; then
    echo -e "  Site ID    : $SITE_ID"
  fi
  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo "  1. Restart your IDE"
  echo "  2. Start a conversation and use CMS tools"
  if [ -z "$TOKEN" ] || [ -z "$SESSION_ID" ]; then
    echo ""
    echo -e "  ${YELLOW}Credentials not fully set. In your first chat, ask the AI:${NC}"
    echo -e "    ${BOLD}\"Update auth with token=... session_id=...\"${NC}"
    echo "    (get from browser DevTools > Network > any API request headers)"
  fi
  if [ -z "$SITE_ID" ]; then
    echo ""
    echo -e "  ${YELLOW}Site not set. In your first chat, ask the AI:${NC}"
    echo -e "    ${BOLD}\"List my sites\"${NC} then ${BOLD}\"Switch to site <name>\"${NC}"
  fi
  echo ""
  echo -e "  ${BOLD}Test (Claude Code):${NC}"
  echo "    claude mcp list"
  echo ""
  echo -e "  ${BOLD}Manual run:${NC}"
  echo "    WEBCAKE_API_URL=$API_URL \\"
  echo "    WEBCAKE_TOKEN=<token> \\"
  echo "    WEBCAKE_SESSION_ID=<session_id> \\"
  echo "    $NODE_BIN $MCP_INDEX"
  echo ""
}

# ── Uninstall ──

uninstall() {
  print_banner
  echo -e "${BOLD}── Uninstall WebCake CMS MCP ──${NC}"
  echo ""

  # Remove installed directory
  if [ -d "$DEFAULT_INSTALL_DIR" ]; then
    read -rp "  Remove $DEFAULT_INSTALL_DIR? (y/N): " CONFIRM < /dev/tty
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
      rm -rf "$DEFAULT_INSTALL_DIR"
      success "Removed $DEFAULT_INSTALL_DIR"
    fi
  fi

  # Remove Claude Code config
  if command -v claude &> /dev/null; then
    claude mcp remove webcake-cms 2>/dev/null && success "Removed from Claude Code" || true
  fi

  # Remove from Cursor
  if [ -f "$HOME/.cursor/mcp.json" ]; then
    node -e "
      const fs = require('fs');
      const f = '$HOME/.cursor/mcp.json';
      const c = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (c.mcpServers) delete c.mcpServers['webcake-cms'];
      fs.writeFileSync(f, JSON.stringify(c, null, 2));
    " 2>/dev/null && success "Removed from Cursor config" || true
  fi

  echo ""
  success "Uninstall complete. Restart your IDEs."
}

# ── Main ──

main() {
  print_banner

  # Handle --uninstall flag
  if [ "${1:-}" = "--uninstall" ] || [ "${1:-}" = "uninstall" ]; then
    uninstall
    exit 0
  fi

  check_node
  check_npm

  install_mcp
  collect_env
  select_ides
  verify
  print_summary
}

main "$@"
