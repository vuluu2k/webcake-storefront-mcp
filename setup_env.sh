#!/bin/bash

# ═══════════════════════════════════════════════════════════
#  WebCake CMS MCP Server - Setup Additional Environment Variables
#  Configure: Knowledge, GitHub Repo, and other optional env vars
# ═══════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

print_banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  ${BOLD}WebCake CMS MCP - Setup Environment Variables${NC}    ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  Knowledge, GitHub Repo, and more                   ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
}

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Detect MCP server installation ──

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_INSTALL_DIR="$HOME/.webcake-storefront-mcp"

detect_install() {
  # Check if running from repo directory
  if [ -f "$SCRIPT_DIR/index.js" ]; then
    INSTALL_DIR="$SCRIPT_DIR"
  elif [ -d "$DEFAULT_INSTALL_DIR" ] && [ -f "$DEFAULT_INSTALL_DIR/index.js" ]; then
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
  else
    echo ""
    warn "MCP server not found at default location."
    read -rp "  Enter MCP server path: " INSTALL_DIR < /dev/tty
    INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"
    if [ ! -f "$INSTALL_DIR/index.js" ]; then
      error "index.js not found at $INSTALL_DIR"
      exit 1
    fi
  fi

  MCP_INDEX="$INSTALL_DIR/index.js"
  success "MCP server found at ${BOLD}$INSTALL_DIR${NC}"
}

# ── Detect Node.js ──

detect_node() {
  if command -v node &> /dev/null; then
    NODE_BIN="$(which node)"
    case "$NODE_BIN" in
      /*) ;;
      *)  NODE_BIN="/usr/local/bin/node" ;;
    esac
    success "Node.js $(node -v) at ${BOLD}$NODE_BIN${NC}"
  else
    error "Node.js not found. Run install.sh first."
    exit 1
  fi
}

# ── Collect knowledge env vars ──

KNOWLEDGE_DIR=""
KNOWLEDGE_REPO=""
KNOWLEDGE_TOKEN=""

collect_knowledge_env() {
  echo ""
  echo -e "${BOLD}── Knowledge Configuration ──${NC}"
  echo ""
  echo -e "  Knowledge files teach the AI agent your business rules,"
  echo -e "  coding standards, API docs, and more."
  echo ""
  echo -e "  ${YELLOW}Sources:${NC}"
  echo -e "    1. ${BOLD}Local directory${NC} — .md/.txt/.json files in a folder"
  echo -e "    2. ${BOLD}GitHub repo${NC}    — auto-fetch from a GitHub repository"
  echo -e "    (Both can work together — local files take priority)"
  echo ""

  # Knowledge directory
  DEFAULT_KNOWLEDGE_DIR="$INSTALL_DIR/knowledge"
  echo -e "  ${BOLD}Local knowledge directory${NC}"
  echo -e "  Default: ${BOLD}$DEFAULT_KNOWLEDGE_DIR${NC}"
  read -rp "  WEBCAKE_KNOWLEDGE_DIR (Enter for default, 'skip' to skip): " INPUT_DIR < /dev/tty

  if [ "$INPUT_DIR" != "skip" ] && [ "$INPUT_DIR" != "s" ]; then
    if [ -n "$INPUT_DIR" ]; then
      KNOWLEDGE_DIR="${INPUT_DIR/#\~/$HOME}"
    else
      KNOWLEDGE_DIR="$DEFAULT_KNOWLEDGE_DIR"
    fi

    # Create directory if it doesn't exist
    if [ ! -d "$KNOWLEDGE_DIR" ]; then
      read -rp "  Directory doesn't exist. Create it? (Y/n): " CREATE_DIR < /dev/tty
      CREATE_DIR="${CREATE_DIR:-Y}"
      if [[ "$CREATE_DIR" =~ ^[Yy]$ ]]; then
        mkdir -p "$KNOWLEDGE_DIR"
        success "Created $KNOWLEDGE_DIR"

        # Copy example file if not exists
        if [ -f "$INSTALL_DIR/knowledge/example.md" ] && [ "$KNOWLEDGE_DIR" != "$DEFAULT_KNOWLEDGE_DIR" ]; then
          cp "$INSTALL_DIR/knowledge/example.md" "$KNOWLEDGE_DIR/"
          info "Copied example.md to get you started"
        fi
      fi
    fi

    # Show existing files
    if [ -d "$KNOWLEDGE_DIR" ]; then
      FILE_COUNT=$(find "$KNOWLEDGE_DIR" -maxdepth 1 -type f \( -name "*.md" -o -name "*.txt" -o -name "*.json" \) 2>/dev/null | wc -l | tr -d ' ')
      if [ "$FILE_COUNT" -gt 0 ]; then
        success "Found $FILE_COUNT knowledge file(s) in $KNOWLEDGE_DIR:"
        find "$KNOWLEDGE_DIR" -maxdepth 1 -type f \( -name "*.md" -o -name "*.txt" -o -name "*.json" \) -exec basename {} \; 2>/dev/null | sort | while read -r f; do
          echo "    - $f"
        done
      else
        info "No knowledge files yet. Add .md/.txt/.json files to $KNOWLEDGE_DIR"
      fi
    fi
  fi

  echo ""

  # GitHub repo
  echo -e "  ${BOLD}GitHub repository (optional)${NC}"
  echo -e "  Formats: owner/repo, owner/repo/docs, or full GitHub URL"
  echo -e "  Example: ${BOLD}mycompany/knowledge-base${NC}"
  read -rp "  WEBCAKE_KNOWLEDGE_REPO (Enter to skip): " KNOWLEDGE_REPO < /dev/tty
  KNOWLEDGE_REPO="${KNOWLEDGE_REPO:-}"

  # GitHub token (only ask if repo is set)
  if [ -n "$KNOWLEDGE_REPO" ]; then
    echo ""
    echo -e "  ${BOLD}GitHub token (for private repos)${NC}"
    echo -e "  Public repos don't need a token."
    echo -e "  Create one at: github.com/settings/tokens (scope: repo)"
    read -rp "  WEBCAKE_KNOWLEDGE_TOKEN (Enter to skip): " KNOWLEDGE_TOKEN < /dev/tty
    KNOWLEDGE_TOKEN="${KNOWLEDGE_TOKEN:-}"
  fi

  echo ""
  success "Knowledge configuration:"
  if [ -n "$KNOWLEDGE_DIR" ]; then
    echo "  Directory  : $KNOWLEDGE_DIR"
  else
    echo -e "  Directory  : ${YELLOW}(default — $DEFAULT_KNOWLEDGE_DIR)${NC}"
  fi
  if [ -n "$KNOWLEDGE_REPO" ]; then
    echo "  GitHub Repo: $KNOWLEDGE_REPO"
  else
    echo -e "  GitHub Repo: ${YELLOW}(not set)${NC}"
  fi
  if [ -n "$KNOWLEDGE_TOKEN" ]; then
    echo "  GitHub Token: ${KNOWLEDGE_TOKEN:0:8}..."
  elif [ -n "$KNOWLEDGE_REPO" ]; then
    echo -e "  GitHub Token: ${YELLOW}(not set — public repo only)${NC}"
  fi
}

# ── Build env object for IDE configs ──

build_env_vars() {
  # Start with the knowledge env vars
  ENV_VARS=""

  if [ -n "$KNOWLEDGE_DIR" ]; then
    ENV_VARS="$ENV_VARS WEBCAKE_KNOWLEDGE_DIR=\"$KNOWLEDGE_DIR\""
  fi
  if [ -n "$KNOWLEDGE_REPO" ]; then
    ENV_VARS="$ENV_VARS WEBCAKE_KNOWLEDGE_REPO=\"$KNOWLEDGE_REPO\""
  fi
  if [ -n "$KNOWLEDGE_TOKEN" ]; then
    ENV_VARS="$ENV_VARS WEBCAKE_KNOWLEDGE_TOKEN=\"$KNOWLEDGE_TOKEN\""
  fi
}

# ── Update IDE configs ──

update_json_config() {
  local CONFIG_FILE="$1"
  local CONFIG_NAME="$2"

  if [ ! -f "$CONFIG_FILE" ]; then
    warn "$CONFIG_NAME config not found at $CONFIG_FILE — skipping"
    return
  fi

  # Check if webcake-cms entry exists
  if ! node -e "
    const fs = require('fs');
    const c = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    if (!c.mcpServers || !c.mcpServers['webcake-cms']) process.exit(1);
  " 2>/dev/null; then
    warn "$CONFIG_NAME: webcake-cms not configured — skipping"
    return
  fi

  # Merge new env vars into existing config
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    const env = config.mcpServers['webcake-cms'].env || {};

    // Knowledge env vars
    const knowledgeDir = '$KNOWLEDGE_DIR';
    const knowledgeRepo = '$KNOWLEDGE_REPO';
    const knowledgeToken = '$KNOWLEDGE_TOKEN';

    if (knowledgeDir) env.WEBCAKE_KNOWLEDGE_DIR = knowledgeDir;
    else delete env.WEBCAKE_KNOWLEDGE_DIR;

    if (knowledgeRepo) env.WEBCAKE_KNOWLEDGE_REPO = knowledgeRepo;
    else delete env.WEBCAKE_KNOWLEDGE_REPO;

    if (knowledgeToken) env.WEBCAKE_KNOWLEDGE_TOKEN = knowledgeToken;
    else delete env.WEBCAKE_KNOWLEDGE_TOKEN;

    config.mcpServers['webcake-cms'].env = env;
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
  "

  success "$CONFIG_NAME updated ($CONFIG_FILE)"
}

update_claude_code_cli() {
  if ! command -v claude &> /dev/null; then
    return 1
  fi

  # Build -e flags for additional env vars
  local ENV_FLAGS=""
  if [ -n "$KNOWLEDGE_DIR" ]; then
    ENV_FLAGS="$ENV_FLAGS -e WEBCAKE_KNOWLEDGE_DIR=$KNOWLEDGE_DIR"
  fi
  if [ -n "$KNOWLEDGE_REPO" ]; then
    ENV_FLAGS="$ENV_FLAGS -e WEBCAKE_KNOWLEDGE_REPO=$KNOWLEDGE_REPO"
  fi
  if [ -n "$KNOWLEDGE_TOKEN" ]; then
    ENV_FLAGS="$ENV_FLAGS -e WEBCAKE_KNOWLEDGE_TOKEN=$KNOWLEDGE_TOKEN"
  fi

  if [ -z "$ENV_FLAGS" ]; then
    info "No env vars to add via Claude CLI"
    return 0
  fi

  # Read existing config to preserve base env vars
  local EXISTING_ENV
  EXISTING_ENV=$(claude mcp get webcake-cms 2>/dev/null || echo "")

  if [ -z "$EXISTING_ENV" ]; then
    warn "Claude Code: webcake-cms not found. Run install.sh first."
    return 1
  fi

  # Re-add with all env vars (claude mcp add overwrites)
  # We need to get existing env vars first
  info "Updating Claude Code MCP config..."

  # Fall back to JSON config file update
  return 1
}

update_codex_config() {
  CODEX_CONFIG="$HOME/.codex/config.toml"

  if [ ! -f "$CODEX_CONFIG" ]; then
    warn "Codex config not found — skipping"
    return
  fi

  if ! grep -q '\[mcp_servers\.webcake-cms\]' "$CODEX_CONFIG" 2>/dev/null; then
    warn "Codex: webcake-cms not configured — skipping"
    return
  fi

  # Update the env line in the TOML config
  node -e "
    const fs = require('fs');
    let content = fs.readFileSync('$CODEX_CONFIG', 'utf8');

    // Find the webcake-cms section and update its env line
    const envParts = [];
    const knowledgeDir = '$KNOWLEDGE_DIR';
    const knowledgeRepo = '$KNOWLEDGE_REPO';
    const knowledgeToken = '$KNOWLEDGE_TOKEN';

    // Extract existing env vars from the line
    const envMatch = content.match(/(\[mcp_servers\.webcake-cms\][\s\S]*?env\s*=\s*\{)(.*?)(\})/);
    if (envMatch) {
      let envStr = envMatch[2];

      // Parse existing key-value pairs
      const existing = {};
      for (const m of envStr.matchAll(/\"(\w+)\"\s*=\s*\"([^\"]*)\"/g)) {
        existing[m[1]] = m[2];
      }

      // Add/update knowledge vars
      if (knowledgeDir) existing['WEBCAKE_KNOWLEDGE_DIR'] = knowledgeDir;
      else delete existing['WEBCAKE_KNOWLEDGE_DIR'];

      if (knowledgeRepo) existing['WEBCAKE_KNOWLEDGE_REPO'] = knowledgeRepo;
      else delete existing['WEBCAKE_KNOWLEDGE_REPO'];

      if (knowledgeToken) existing['WEBCAKE_KNOWLEDGE_TOKEN'] = knowledgeToken;
      else delete existing['WEBCAKE_KNOWLEDGE_TOKEN'];

      // Rebuild env string
      const newEnv = Object.entries(existing)
        .map(([k, v]) => '\"' + k + '\" = \"' + v + '\"')
        .join(', ');

      content = content.replace(envMatch[0], envMatch[1] + ' ' + newEnv + ' ' + envMatch[3]);
      fs.writeFileSync('$CODEX_CONFIG', content);
    }
  " 2>/dev/null

  success "Codex updated ($CODEX_CONFIG)"
}

# ── IDE selection for update ──

update_ides() {
  echo ""
  echo -e "${BOLD}── Update IDE configurations ──${NC}"
  echo ""

  # Detect which IDEs have webcake-cms configured
  local FOUND_IDES=()

  # Claude Code (JSON fallback)
  CLAUDE_CONFIG="$HOME/.claude.json"
  if [ -f "$CLAUDE_CONFIG" ] && node -e "const c=JSON.parse(require('fs').readFileSync('$CLAUDE_CONFIG','utf8'));if(!c.mcpServers?.['webcake-cms'])process.exit(1)" 2>/dev/null; then
    FOUND_IDES+=("claude-code")
    echo -e "  ${GREEN}✓${NC} Claude Code         ($CLAUDE_CONFIG)"
  fi

  # Claude Desktop
  CLAUDE_DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
  if [ ! -f "$CLAUDE_DESKTOP_CONFIG" ]; then
    CLAUDE_DESKTOP_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
  fi
  if [ -f "$CLAUDE_DESKTOP_CONFIG" ] && node -e "const c=JSON.parse(require('fs').readFileSync('$CLAUDE_DESKTOP_CONFIG','utf8'));if(!c.mcpServers?.['webcake-cms'])process.exit(1)" 2>/dev/null; then
    FOUND_IDES+=("claude-desktop")
    echo -e "  ${GREEN}✓${NC} Claude Desktop      ($CLAUDE_DESKTOP_CONFIG)"
  fi

  # Cursor
  CURSOR_CONFIG="$HOME/.cursor/mcp.json"
  if [ -f "$CURSOR_CONFIG" ] && node -e "const c=JSON.parse(require('fs').readFileSync('$CURSOR_CONFIG','utf8'));if(!c.mcpServers?.['webcake-cms'])process.exit(1)" 2>/dev/null; then
    FOUND_IDES+=("cursor")
    echo -e "  ${GREEN}✓${NC} Cursor              ($CURSOR_CONFIG)"
  fi

  # Windsurf
  WINDSURF_CONFIG="$HOME/.codeium/windsurf/mcp_config.json"
  if [ -f "$WINDSURF_CONFIG" ] && node -e "const c=JSON.parse(require('fs').readFileSync('$WINDSURF_CONFIG','utf8'));if(!c.mcpServers?.['webcake-cms'])process.exit(1)" 2>/dev/null; then
    FOUND_IDES+=("windsurf")
    echo -e "  ${GREEN}✓${NC} Windsurf            ($WINDSURF_CONFIG)"
  fi

  # Augment
  AUGMENT_CONFIG=""
  for dir in "$HOME/Library/Application Support/Code/User" "$HOME/.config/Code/User" "$HOME/.vscode"; do
    if [ -f "$dir/augment_mcp.json" ]; then
      AUGMENT_CONFIG="$dir/augment_mcp.json"
      break
    fi
  done
  if [ -n "$AUGMENT_CONFIG" ] && node -e "const c=JSON.parse(require('fs').readFileSync('$AUGMENT_CONFIG','utf8'));if(!c.mcpServers?.['webcake-cms'])process.exit(1)" 2>/dev/null; then
    FOUND_IDES+=("augment")
    echo -e "  ${GREEN}✓${NC} Augment             ($AUGMENT_CONFIG)"
  fi

  # Codex
  CODEX_CONFIG="$HOME/.codex/config.toml"
  if [ -f "$CODEX_CONFIG" ] && grep -q '\[mcp_servers\.webcake-cms\]' "$CODEX_CONFIG" 2>/dev/null; then
    FOUND_IDES+=("codex")
    echo -e "  ${GREEN}✓${NC} Codex               ($CODEX_CONFIG)"
  fi

  if [ ${#FOUND_IDES[@]} -eq 0 ]; then
    warn "No IDE configs found with webcake-cms. Run install.sh first."
    return
  fi

  echo ""
  read -rp "  Update all detected IDEs? (Y/n): " UPDATE_ALL < /dev/tty
  UPDATE_ALL="${UPDATE_ALL:-Y}"

  if [[ ! "$UPDATE_ALL" =~ ^[Yy]$ ]]; then
    info "Skipping IDE updates."
    return
  fi

  echo ""
  for ide in "${FOUND_IDES[@]}"; do
    case "$ide" in
      claude-code)    update_json_config "$CLAUDE_CONFIG" "Claude Code" ;;
      claude-desktop) update_json_config "$CLAUDE_DESKTOP_CONFIG" "Claude Desktop" ;;
      cursor)         update_json_config "$CURSOR_CONFIG" "Cursor" ;;
      windsurf)       update_json_config "$WINDSURF_CONFIG" "Windsurf" ;;
      augment)        update_json_config "$AUGMENT_CONFIG" "Augment" ;;
      codex)          update_codex_config ;;
    esac
  done
}

# ── Print summary ──

print_summary() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Environment Setup Complete!${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo ""

  echo -e "  ${BOLD}Knowledge:${NC}"
  if [ -n "$KNOWLEDGE_DIR" ]; then
    echo "    Directory : $KNOWLEDGE_DIR"
  fi
  if [ -n "$KNOWLEDGE_REPO" ]; then
    echo "    GitHub    : $KNOWLEDGE_REPO"
  fi
  echo ""

  echo -e "  ${BOLD}Next steps:${NC}"
  echo "  1. Restart your IDE to apply changes"

  if [ -n "$KNOWLEDGE_DIR" ]; then
    echo "  2. Add .md files to $KNOWLEDGE_DIR"
    echo "     (see example.md for the format)"
  fi

  echo ""
  echo -e "  ${BOLD}Test in chat:${NC}"
  echo "    \"List knowledge files\""
  echo "    \"Read the business-rules knowledge\""
  echo ""

  echo -e "  ${BOLD}All environment variables:${NC}"
  echo ""
  echo -e "  ${BOLD}Required (set via install.sh):${NC}"
  echo "    WEBCAKE_API_URL        — Backend API URL"
  echo "    WEBCAKE_TOKEN          — JWT Bearer token"
  echo "    WEBCAKE_SESSION_ID     — Session ID"
  echo "    WEBCAKE_SITE_ID        — Target site ID"
  echo ""
  echo -e "  ${BOLD}Optional (set via this script):${NC}"
  echo "    WEBCAKE_KNOWLEDGE_DIR  — Custom knowledge files directory"
  echo "    WEBCAKE_KNOWLEDGE_REPO — GitHub repo (owner/repo or full URL)"
  echo "    WEBCAKE_KNOWLEDGE_TOKEN— GitHub token (for private repos)"
  echo ""
}

# ── Main ──

main() {
  print_banner

  detect_install
  detect_node

  collect_knowledge_env
  build_env_vars
  update_ides
  print_summary
}

main "$@"
