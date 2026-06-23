#!/bin/bash

# ═══════════════════════════════════════════════════════════
#  WebCake CMS MCP Server - Trình cài đặt tự động
#  Hỗ trợ: Claude Desktop, Claude Code, Cursor, Windsurf, Augment, Codex
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
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  ${BOLD}WebCake CMS MCP Server - Cài đặt${NC}               ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  Claude Desktop, Claude Code, Cursor, Windsurf...${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
}

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[CẢNH BÁO]${NC} $1"; }
error()   { echo -e "${RED}[LỖI]${NC} $1"; }

# ── Kiểm tra yêu cầu ──

install_node() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &> /dev/null; then
      info "Đang cài Node.js qua Homebrew..."
      brew install node@20
      brew link --overwrite node@20 2>/dev/null || brew link --force node@20 2>/dev/null || true
    else
      info "Đang cài Homebrew trước..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      if [ -f "/opt/homebrew/bin/brew" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
      elif [ -f "/usr/local/bin/brew" ]; then
        eval "$(/usr/local/bin/brew shellenv)"
      fi
      brew install node@20
      brew link --overwrite node@20 2>/dev/null || brew link --force node@20 2>/dev/null || true
    fi
  elif command -v apt-get &> /dev/null; then
    info "Đang cài Node.js 20 qua NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v yum &> /dev/null; then
    info "Đang cài Node.js 20 qua NodeSource..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
  else
    error "Không thể tự cài Node.js trên hệ điều hành này."
    echo "  Vui lòng cài thủ công: https://nodejs.org/"
    exit 1
  fi

  if ! command -v node &> /dev/null; then
    error "Cài Node.js thất bại."
    echo "  Vui lòng cài thủ công: https://nodejs.org/"
    exit 1
  fi
  success "Đã cài Node.js $(node -v)"
}

check_node() {
  local NEED_INSTALL=false

  if ! command -v node &> /dev/null; then
    warn "Chưa cài Node.js."
    NEED_INSTALL=true
  else
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
      warn "Cần Node.js >= 18. Hiện tại: $(node -v)"
      NEED_INSTALL=true
    fi
  fi

  if [ "$NEED_INSTALL" = true ]; then
    echo ""
    read -rp "  Tự động cài Node.js 20 LTS? (C/k): " INSTALL_NODE < /dev/tty
    INSTALL_NODE="${INSTALL_NODE:-C}"
    if [[ "$INSTALL_NODE" =~ ^[CcYy]$ ]]; then
      install_node
    else
      error "Cần Node.js >= 18. Cài xong rồi chạy lại."
      echo "  https://nodejs.org/"
      exit 1
    fi
  fi

  NODE_BIN="$(which node)"
  case "$NODE_BIN" in
    /*) ;;
    *)  NODE_BIN="/usr/local/bin/node" ;;
  esac

  success "Node.js $(node -v) tại ${BOLD}$NODE_BIN${NC}"
}

check_npm() {
  if ! command -v npm &> /dev/null; then
    error "Chưa cài npm."
    exit 1
  fi
  success "npm $(npm -v)"
}

# ── Cài MCP server ──

REPO_URL="https://github.com/vuluu2k/webcake-storefront-mcp.git"
DEFAULT_INSTALL_DIR="$HOME/.webcake-storefront-mcp"

install_mcp() {
  echo ""
  info "Cài MCP server vào đâu?"
  echo -e "  Mặc định: ${BOLD}$DEFAULT_INSTALL_DIR${NC}"
  read -rp "  Đường dẫn (Enter để dùng mặc định): " INSTALL_DIR < /dev/tty
  INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
  INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

  if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/index.js" ]; then
    success "MCP server đã có tại $INSTALL_DIR"
    read -rp "  Cập nhật lên bản mới nhất? (c/K): " UPDATE < /dev/tty
    if [[ "$UPDATE" =~ ^[CcYy]$ ]]; then
      info "Đang cập nhật..."
      cd "$INSTALL_DIR"
      git pull origin main 2>/dev/null || git pull 2>/dev/null || warn "Git pull thất bại, dùng bản hiện tại"
      npm install --production
      success "Cập nhật thành công"
      cd - > /dev/null
    fi
  else
    info "Đang clone repository..."
    if command -v git &> /dev/null; then
      git clone "$REPO_URL" "$INSTALL_DIR"
    else
      warn "Không tìm thấy git."
      mkdir -p "$INSTALL_DIR"
      SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
      if [ -f "$SCRIPT_DIR/index.js" ]; then
        cp "$SCRIPT_DIR/index.js" "$INSTALL_DIR/"
        cp "$SCRIPT_DIR/api.js" "$INSTALL_DIR/"
        cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
      else
        error "Không thể cài mà không có git. Vui lòng cài git trước."
        exit 1
      fi
    fi

    info "Đang cài dependencies..."
    cd "$INSTALL_DIR"
    npm install --production
    cd - > /dev/null
    success "Đã cài MCP server tại $INSTALL_DIR"
  fi

  MCP_INDEX="$INSTALL_DIR/index.js"
}

# ── Thu thập biến môi trường ──

collect_env() {
  echo ""
  echo -e "${BOLD}── Cấu hình kết nối ──${NC}"
  echo ""
  echo -e "  ${YELLOW}Cách lấy token & session_id:${NC}"
  echo "    1. Đăng nhập vào dashboard WebCake/StoreCake"
  echo "    2. Mở DevTools (F12) > tab Network"
  echo "    3. Click bất kỳ trang nào, tìm một API request"
  echo "    4. Copy giá trị header 'Authorization: Bearer ...' → token"
  echo "    5. Copy giá trị header 'x-session-id' → session_id"
  echo ""

  # API URL
  read -rp "  WEBCAKE_API_URL [https://api.storecake.io]: " API_URL < /dev/tty
  API_URL="${API_URL:-https://api.storecake.io}"

  # Token
  read -rp "  WEBCAKE_TOKEN (JWT token, Enter để bỏ qua): " TOKEN < /dev/tty
  TOKEN="${TOKEN:-}"

  # Session ID
  read -rp "  WEBCAKE_SESSION_ID (x-session-id, Enter để bỏ qua): " SESSION_ID < /dev/tty
  SESSION_ID="${SESSION_ID:-}"

  # Site ID
  read -rp "  WEBCAKE_SITE_ID (Enter để bỏ qua — chọn sau bằng AI): " SITE_ID < /dev/tty
  SITE_ID="${SITE_ID:-}"

  echo ""
  success "Cấu hình:"
  echo "  API URL    : $API_URL"
  if [ -n "$TOKEN" ]; then
    echo "  Token      : ${TOKEN:0:20}..."
  else
    echo -e "  Token      : ${YELLOW}(chưa set — dùng update_auth tool sau)${NC}"
  fi
  if [ -n "$SESSION_ID" ]; then
    echo "  Session ID : ${SESSION_ID:0:12}..."
  else
    echo -e "  Session ID : ${YELLOW}(chưa set — dùng update_auth tool sau)${NC}"
  fi
  if [ -n "$SITE_ID" ]; then
    echo "  Site ID    : $SITE_ID"
  else
    echo -e "  Site ID    : ${YELLOW}(chưa set — dùng switch_site tool sau)${NC}"
  fi
}

# ── Cấu hình IDE ──

build_env_json() {
  cat << ENVEOF
          WEBCAKE_API_URL: '$API_URL',
              WEBCAKE_TOKEN: '$TOKEN',
              WEBCAKE_SESSION_ID: '$SESSION_ID',
              WEBCAKE_SITE_ID: '$SITE_ID'
ENVEOF
}

write_mcp_json() {
  local CONFIG_FILE="$1"
  cat > "$CONFIG_FILE" << JSONEOF
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

merge_mcp_json() {
  local CONFIG_FILE="$1"
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
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
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
  "
}

configure_claude_code() {
  info "Đang cấu hình Claude Code..."

  if command -v claude &> /dev/null; then
    claude mcp add webcake-cms \
      -e WEBCAKE_API_URL="$API_URL" \
      -e WEBCAKE_TOKEN="$TOKEN" \
      -e WEBCAKE_SESSION_ID="$SESSION_ID" \
      -e WEBCAKE_SITE_ID="$SITE_ID" \
      -- "$NODE_BIN" "$MCP_INDEX"
    success "Đã cấu hình Claude Code (qua CLI)"
  else
    CLAUDE_CONFIG="$HOME/.claude.json"
    if [ -f "$CLAUDE_CONFIG" ] && [ -s "$CLAUDE_CONFIG" ]; then
      merge_mcp_json "$CLAUDE_CONFIG"
    else
      write_mcp_json "$CLAUDE_CONFIG"
    fi
    success "Đã cấu hình Claude Code ($CLAUDE_CONFIG)"
  fi
}

configure_claude_desktop() {
  info "Đang cấu hình Claude Desktop..."

  CLAUDE_DESKTOP_DIR="$HOME/Library/Application Support/Claude"
  if [ ! -d "$CLAUDE_DESKTOP_DIR" ]; then
    CLAUDE_DESKTOP_DIR="$HOME/.config/Claude"
  fi

  mkdir -p "$CLAUDE_DESKTOP_DIR"
  CLAUDE_DESKTOP_CONFIG="$CLAUDE_DESKTOP_DIR/claude_desktop_config.json"

  if [ -f "$CLAUDE_DESKTOP_CONFIG" ] && [ -s "$CLAUDE_DESKTOP_CONFIG" ]; then
    merge_mcp_json "$CLAUDE_DESKTOP_CONFIG"
  else
    write_mcp_json "$CLAUDE_DESKTOP_CONFIG"
  fi

  success "Đã cấu hình Claude Desktop ($CLAUDE_DESKTOP_CONFIG)"
  warn "Khởi động lại Claude Desktop để kích hoạt"
}

configure_cursor() {
  info "Đang cấu hình Cursor..."

  CURSOR_DIR="$HOME/.cursor"
  mkdir -p "$CURSOR_DIR"
  CURSOR_CONFIG="$CURSOR_DIR/mcp.json"

  if [ -f "$CURSOR_CONFIG" ] && [ -s "$CURSOR_CONFIG" ]; then
    merge_mcp_json "$CURSOR_CONFIG"
  else
    write_mcp_json "$CURSOR_CONFIG"
  fi

  success "Đã cấu hình Cursor ($CURSOR_CONFIG)"
}

configure_windsurf() {
  info "Đang cấu hình Windsurf..."

  WINDSURF_DIR="$HOME/.codeium/windsurf"
  mkdir -p "$WINDSURF_DIR"
  WINDSURF_CONFIG="$WINDSURF_DIR/mcp_config.json"

  if [ -f "$WINDSURF_CONFIG" ] && [ -s "$WINDSURF_CONFIG" ]; then
    merge_mcp_json "$WINDSURF_CONFIG"
  else
    write_mcp_json "$WINDSURF_CONFIG"
  fi

  success "Đã cấu hình Windsurf ($WINDSURF_CONFIG)"
}

configure_augment() {
  info "Đang cấu hình Augment (VS Code)..."

  VSCODE_DIR="$HOME/.vscode"
  if [ -d "$HOME/Library/Application Support/Code/User" ]; then
    VSCODE_DIR="$HOME/Library/Application Support/Code/User"
  elif [ -d "$HOME/.config/Code/User" ]; then
    VSCODE_DIR="$HOME/.config/Code/User"
  fi

  AUGMENT_CONFIG="$VSCODE_DIR/augment_mcp.json"
  mkdir -p "$VSCODE_DIR"
  write_mcp_json "$AUGMENT_CONFIG"

  success "Đã ghi config Augment tại $AUGMENT_CONFIG"
  warn "Mở VS Code > Cmd+Shift+P > 'Augment: Edit MCP Settings' và paste config"
}

configure_codex() {
  info "Đang cấu hình Codex (OpenAI)..."

  CODEX_DIR="$HOME/.codex"
  CODEX_CONFIG="$CODEX_DIR/config.toml"
  mkdir -p "$CODEX_DIR"

  TOML_BLOCK=$(cat << TOMLEOF

[mcp_servers.webcake-cms]
command = "$NODE_BIN"
args = ["$MCP_INDEX"]
env = { "WEBCAKE_API_URL" = "$API_URL", "WEBCAKE_TOKEN" = "$TOKEN", "WEBCAKE_SESSION_ID" = "$SESSION_ID", "WEBCAKE_SITE_ID" = "$SITE_ID" }
TOMLEOF
)

  if [ -f "$CODEX_CONFIG" ]; then
    if grep -q '\[mcp_servers\.webcake-cms\]' "$CODEX_CONFIG" 2>/dev/null; then
      node -e "
        const fs = require('fs');
        let content = fs.readFileSync('$CODEX_CONFIG', 'utf8');
        content = content.replace(/\\n?\\[mcp_servers\\.webcake-cms\\][\\s\\S]*?(?=\\n\\[|$)/, '');
        fs.writeFileSync('$CODEX_CONFIG', content.trimEnd() + '\\n');
      " 2>/dev/null
      info "Đang thay thế config webcake-cms cũ..."
    fi
    echo "$TOML_BLOCK" >> "$CODEX_CONFIG"
  else
    echo "# WebCake CMS MCP Server" > "$CODEX_CONFIG"
    echo "$TOML_BLOCK" >> "$CODEX_CONFIG"
  fi

  success "Đã cấu hình Codex ($CODEX_CONFIG)"
}

# ── Menu chọn IDE ──

select_ides() {
  echo ""
  echo -e "${BOLD}── Chọn IDE/Tool để cấu hình ──${NC}"
  echo ""
  echo "  1) Claude Desktop"
  echo "  2) Claude Code (CLI)"
  echo "  3) Cursor"
  echo "  4) Windsurf"
  echo "  5) Augment (VS Code)"
  echo "  6) Codex (OpenAI)"
  echo "  7) Tất cả"
  echo "  0) Bỏ qua (cài thủ công sau)"
  echo ""
  read -rp "  Chọn (phân cách bằng dấu phẩy, vd: 1,2): " IDE_CHOICE < /dev/tty

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
      0) info "Bỏ qua cấu hình IDE." ;;
      *) warn "Lựa chọn không hợp lệ: $choice" ;;
    esac
  done
}

# ── Kiểm tra cài đặt ──

verify() {
  echo ""
  info "Đang kiểm tra..."

  if node -e "import('$MCP_INDEX')" 2>/dev/null; then
    success "MCP server load thành công"
  else
    node --check "$MCP_INDEX" 2>/dev/null && success "Cú pháp OK" || warn "Không thể kiểm tra (có thể cần biến môi trường)"
  fi
}

# ── Tổng kết ──

print_summary() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Cài đặt hoàn tất!${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Node.js    : ${BOLD}$NODE_BIN${NC}"
  echo -e "  MCP Server : ${BOLD}$MCP_INDEX${NC}"
  echo -e "  API URL    : $API_URL"
  if [ -n "$SITE_ID" ]; then
    echo -e "  Site ID    : $SITE_ID"
  fi
  echo ""
  echo -e "  ${BOLD}Bước tiếp theo:${NC}"
  echo "  1. Khởi động lại IDE"
  echo "  2. Bắt đầu chat và sử dụng CMS tools"
  if [ -z "$TOKEN" ] || [ -z "$SESSION_ID" ]; then
    echo ""
    echo -e "  ${YELLOW}Chưa đủ thông tin đăng nhập. Trong chat đầu tiên, nói với AI:${NC}"
    echo -e "    ${BOLD}\"Cập nhật auth với token=... session_id=...\"${NC}"
    echo "    (lấy từ DevTools > Network > header của API request)"
  fi
  if [ -z "$SITE_ID" ]; then
    echo ""
    echo -e "  ${YELLOW}Chưa chọn site. Trong chat đầu tiên, nói với AI:${NC}"
    echo -e "    ${BOLD}\"Liệt kê các site của tôi\"${NC} rồi ${BOLD}\"Chuyển sang site <tên>\"${NC}"
  fi
  echo ""
  echo -e "  ${BOLD}Kiểm tra (Claude Code):${NC}"
  echo "    claude mcp list"
  echo ""
  echo -e "  ${BOLD}Chạy thủ công:${NC}"
  echo "    WEBCAKE_API_URL=$API_URL \\"
  echo "    WEBCAKE_TOKEN=<token> \\"
  echo "    WEBCAKE_SESSION_ID=<session_id> \\"
  echo "    $NODE_BIN $MCP_INDEX"
  echo ""
}

# ── Gỡ cài đặt ──

uninstall() {
  print_banner
  echo -e "${BOLD}── Gỡ cài đặt WebCake CMS MCP ──${NC}"
  echo ""

  if [ -d "$DEFAULT_INSTALL_DIR" ]; then
    read -rp "  Xóa $DEFAULT_INSTALL_DIR? (c/K): " CONFIRM < /dev/tty
    if [[ "$CONFIRM" =~ ^[CcYy]$ ]]; then
      rm -rf "$DEFAULT_INSTALL_DIR"
      success "Đã xóa $DEFAULT_INSTALL_DIR"
    fi
  fi

  if command -v claude &> /dev/null; then
    claude mcp remove webcake-cms 2>/dev/null && success "Đã xóa khỏi Claude Code" || true
  fi

  if [ -f "$HOME/.cursor/mcp.json" ]; then
    node -e "
      const fs = require('fs');
      const f = '$HOME/.cursor/mcp.json';
      const c = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (c.mcpServers) delete c.mcpServers['webcake-cms'];
      fs.writeFileSync(f, JSON.stringify(c, null, 2));
    " 2>/dev/null && success "Đã xóa khỏi Cursor" || true
  fi

  echo ""
  success "Gỡ cài đặt hoàn tất. Khởi động lại IDE."
}

# ── Main ──

main() {
  print_banner

  if [ "${1:-}" = "--uninstall" ] || [ "${1:-}" = "uninstall" ] || [ "${1:-}" = "go" ]; then
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
