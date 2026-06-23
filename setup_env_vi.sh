#!/bin/bash

# ═══════════════════════════════════════════════════════════
#  WebCake CMS MCP Server - Cấu hình biến môi trường bổ sung
#  Thiết lập: Knowledge, GitHub Repo, và các biến env phụ
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
  echo -e "${CYAN}║${NC}  ${BOLD}WebCake CMS MCP - Cấu hình biến môi trường${NC}       ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  Knowledge, GitHub Repo, và hơn thế nữa             ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
}

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[CẢNH BÁO]${NC} $1"; }
error()   { echo -e "${RED}[LỖI]${NC} $1"; }

# ── Tìm MCP server đã cài ──

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_INSTALL_DIR="$HOME/.webcake-storefront-mcp"

detect_install() {
  if [ -f "$SCRIPT_DIR/index.js" ]; then
    INSTALL_DIR="$SCRIPT_DIR"
  elif [ -d "$DEFAULT_INSTALL_DIR" ] && [ -f "$DEFAULT_INSTALL_DIR/index.js" ]; then
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
  else
    echo ""
    warn "Không tìm thấy MCP server."
    read -rp "  Nhập đường dẫn MCP server: " INSTALL_DIR < /dev/tty
    INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"
    if [ ! -f "$INSTALL_DIR/index.js" ]; then
      error "Không tìm thấy index.js tại $INSTALL_DIR"
      exit 1
    fi
  fi

  MCP_INDEX="$INSTALL_DIR/index.js"
  success "MCP server tại ${BOLD}$INSTALL_DIR${NC}"
}

# ── Tìm Node.js ──

detect_node() {
  if command -v node &> /dev/null; then
    NODE_BIN="$(which node)"
    case "$NODE_BIN" in
      /*) ;;
      *)  NODE_BIN="/usr/local/bin/node" ;;
    esac
    success "Node.js $(node -v) tại ${BOLD}$NODE_BIN${NC}"
  else
    error "Chưa cài Node.js. Chạy install_vi.sh trước."
    exit 1
  fi
}

# ── Thu thập biến knowledge ──

KNOWLEDGE_DIR=""
KNOWLEDGE_REPO=""
KNOWLEDGE_TOKEN=""

collect_knowledge_env() {
  echo ""
  echo -e "${BOLD}── Cấu hình Knowledge ──${NC}"
  echo ""
  echo -e "  Knowledge files giúp AI hiểu quy tắc kinh doanh,"
  echo -e "  chuẩn code, tài liệu API, và nhiều hơn nữa."
  echo ""
  echo -e "  ${YELLOW}Nguồn dữ liệu:${NC}"
  echo -e "    1. ${BOLD}Thư mục local${NC} — file .md/.txt/.json trong một folder"
  echo -e "    2. ${BOLD}GitHub repo${NC}    — tự động tải từ GitHub repository"
  echo -e "    (Cả 2 nguồn hoạt động song song — local ưu tiên hơn)"
  echo ""

  # Thư mục knowledge
  DEFAULT_KNOWLEDGE_DIR="$INSTALL_DIR/knowledge"
  echo -e "  ${BOLD}Thư mục knowledge local${NC}"
  echo -e "  Mặc định: ${BOLD}$DEFAULT_KNOWLEDGE_DIR${NC}"
  read -rp "  WEBCAKE_KNOWLEDGE_DIR (Enter = mặc định, 'bo' để bỏ qua): " INPUT_DIR < /dev/tty

  if [ "$INPUT_DIR" != "bo" ] && [ "$INPUT_DIR" != "skip" ] && [ "$INPUT_DIR" != "s" ]; then
    if [ -n "$INPUT_DIR" ]; then
      KNOWLEDGE_DIR="${INPUT_DIR/#\~/$HOME}"
    else
      KNOWLEDGE_DIR="$DEFAULT_KNOWLEDGE_DIR"
    fi

    # Tạo thư mục nếu chưa có
    if [ ! -d "$KNOWLEDGE_DIR" ]; then
      read -rp "  Thư mục chưa tồn tại. Tạo mới? (C/k): " CREATE_DIR < /dev/tty
      CREATE_DIR="${CREATE_DIR:-C}"
      if [[ "$CREATE_DIR" =~ ^[CcYy]$ ]]; then
        mkdir -p "$KNOWLEDGE_DIR"
        success "Đã tạo $KNOWLEDGE_DIR"

        # Copy file mẫu
        if [ -f "$INSTALL_DIR/knowledge/example.md" ] && [ "$KNOWLEDGE_DIR" != "$DEFAULT_KNOWLEDGE_DIR" ]; then
          cp "$INSTALL_DIR/knowledge/example.md" "$KNOWLEDGE_DIR/"
          info "Đã copy file mẫu example.md"
        fi
      fi
    fi

    # Hiển thị file hiện có
    if [ -d "$KNOWLEDGE_DIR" ]; then
      FILE_COUNT=$(find "$KNOWLEDGE_DIR" -maxdepth 1 -type f \( -name "*.md" -o -name "*.txt" -o -name "*.json" \) 2>/dev/null | wc -l | tr -d ' ')
      if [ "$FILE_COUNT" -gt 0 ]; then
        success "Tìm thấy $FILE_COUNT knowledge file trong $KNOWLEDGE_DIR:"
        find "$KNOWLEDGE_DIR" -maxdepth 1 -type f \( -name "*.md" -o -name "*.txt" -o -name "*.json" \) -exec basename {} \; 2>/dev/null | sort | while read -r f; do
          echo "    - $f"
        done
      else
        info "Chưa có file nào. Thêm file .md/.txt/.json vào $KNOWLEDGE_DIR"
      fi
    fi
  fi

  echo ""

  # GitHub repo
  echo -e "  ${BOLD}GitHub repository (tuỳ chọn)${NC}"
  echo -e "  Định dạng: owner/repo, owner/repo/docs, hoặc URL GitHub đầy đủ"
  echo -e "  Ví dụ: ${BOLD}mycompany/knowledge-base${NC}"
  read -rp "  WEBCAKE_KNOWLEDGE_REPO (Enter để bỏ qua): " KNOWLEDGE_REPO < /dev/tty
  KNOWLEDGE_REPO="${KNOWLEDGE_REPO:-}"

  # GitHub token (chỉ hỏi nếu có repo)
  if [ -n "$KNOWLEDGE_REPO" ]; then
    echo ""
    echo -e "  ${BOLD}GitHub token (cho repo private)${NC}"
    echo -e "  Repo public không cần token."
    echo -e "  Tạo tại: github.com/settings/tokens (scope: repo)"
    read -rp "  WEBCAKE_KNOWLEDGE_TOKEN (Enter để bỏ qua): " KNOWLEDGE_TOKEN < /dev/tty
    KNOWLEDGE_TOKEN="${KNOWLEDGE_TOKEN:-}"
  fi

  echo ""
  success "Cấu hình Knowledge:"
  if [ -n "$KNOWLEDGE_DIR" ]; then
    echo "  Thư mục    : $KNOWLEDGE_DIR"
  else
    echo -e "  Thư mục    : ${YELLOW}(mặc định — $DEFAULT_KNOWLEDGE_DIR)${NC}"
  fi
  if [ -n "$KNOWLEDGE_REPO" ]; then
    echo "  GitHub Repo: $KNOWLEDGE_REPO"
  else
    echo -e "  GitHub Repo: ${YELLOW}(chưa set)${NC}"
  fi
  if [ -n "$KNOWLEDGE_TOKEN" ]; then
    echo "  GitHub Token: ${KNOWLEDGE_TOKEN:0:8}..."
  elif [ -n "$KNOWLEDGE_REPO" ]; then
    echo -e "  GitHub Token: ${YELLOW}(chưa set — chỉ dùng được repo public)${NC}"
  fi
}

# ── Cập nhật IDE configs ──

update_json_config() {
  local CONFIG_FILE="$1"
  local CONFIG_NAME="$2"

  if [ ! -f "$CONFIG_FILE" ]; then
    warn "$CONFIG_NAME config không tìm thấy tại $CONFIG_FILE — bỏ qua"
    return
  fi

  if ! node -e "
    const fs = require('fs');
    const c = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    if (!c.mcpServers || !c.mcpServers['webcake-cms']) process.exit(1);
  " 2>/dev/null; then
    warn "$CONFIG_NAME: webcake-cms chưa được cấu hình — bỏ qua"
    return
  fi

  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    const env = config.mcpServers['webcake-cms'].env || {};

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

  success "$CONFIG_NAME đã cập nhật ($CONFIG_FILE)"
}

update_codex_config() {
  CODEX_CONFIG="$HOME/.codex/config.toml"

  if [ ! -f "$CODEX_CONFIG" ]; then
    warn "Codex config không tìm thấy — bỏ qua"
    return
  fi

  if ! grep -q '\[mcp_servers\.webcake-cms\]' "$CODEX_CONFIG" 2>/dev/null; then
    warn "Codex: webcake-cms chưa cấu hình — bỏ qua"
    return
  fi

  node -e "
    const fs = require('fs');
    let content = fs.readFileSync('$CODEX_CONFIG', 'utf8');

    const envMatch = content.match(/(\[mcp_servers\.webcake-cms\][\s\S]*?env\s*=\s*\{)(.*?)(\})/);
    if (envMatch) {
      let envStr = envMatch[2];
      const existing = {};
      for (const m of envStr.matchAll(/\"(\w+)\"\s*=\s*\"([^\"]*)\"/g)) {
        existing[m[1]] = m[2];
      }

      const knowledgeDir = '$KNOWLEDGE_DIR';
      const knowledgeRepo = '$KNOWLEDGE_REPO';
      const knowledgeToken = '$KNOWLEDGE_TOKEN';

      if (knowledgeDir) existing['WEBCAKE_KNOWLEDGE_DIR'] = knowledgeDir;
      else delete existing['WEBCAKE_KNOWLEDGE_DIR'];

      if (knowledgeRepo) existing['WEBCAKE_KNOWLEDGE_REPO'] = knowledgeRepo;
      else delete existing['WEBCAKE_KNOWLEDGE_REPO'];

      if (knowledgeToken) existing['WEBCAKE_KNOWLEDGE_TOKEN'] = knowledgeToken;
      else delete existing['WEBCAKE_KNOWLEDGE_TOKEN'];

      const newEnv = Object.entries(existing)
        .map(([k, v]) => '\"' + k + '\" = \"' + v + '\"')
        .join(', ');

      content = content.replace(envMatch[0], envMatch[1] + ' ' + newEnv + ' ' + envMatch[3]);
      fs.writeFileSync('$CODEX_CONFIG', content);
    }
  " 2>/dev/null

  success "Codex đã cập nhật ($CODEX_CONFIG)"
}

# ── Tìm và cập nhật IDE ──

update_ides() {
  echo ""
  echo -e "${BOLD}── Cập nhật cấu hình IDE ──${NC}"
  echo ""

  local FOUND_IDES=()

  # Claude Code
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
    warn "Không tìm thấy IDE nào đã cấu hình webcake-cms. Chạy install_vi.sh trước."
    return
  fi

  echo ""
  read -rp "  Cập nhật tất cả IDE đã tìm thấy? (C/k): " UPDATE_ALL < /dev/tty
  UPDATE_ALL="${UPDATE_ALL:-C}"

  if [[ ! "$UPDATE_ALL" =~ ^[CcYy]$ ]]; then
    info "Bỏ qua cập nhật IDE."
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

# ── Tổng kết ──

print_summary() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Cấu hình biến môi trường hoàn tất!${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo ""

  echo -e "  ${BOLD}Knowledge:${NC}"
  if [ -n "$KNOWLEDGE_DIR" ]; then
    echo "    Thư mục   : $KNOWLEDGE_DIR"
  fi
  if [ -n "$KNOWLEDGE_REPO" ]; then
    echo "    GitHub    : $KNOWLEDGE_REPO"
  fi
  echo ""

  echo -e "  ${BOLD}Bước tiếp theo:${NC}"
  echo "  1. Khởi động lại IDE để áp dụng thay đổi"

  if [ -n "$KNOWLEDGE_DIR" ]; then
    echo "  2. Thêm file .md vào $KNOWLEDGE_DIR"
    echo "     (xem example.md để biết định dạng)"
  fi

  echo ""
  echo -e "  ${BOLD}Thử trong chat:${NC}"
  echo "    \"Liệt kê các knowledge files\""
  echo "    \"Đọc knowledge business-rules\""
  echo ""

  echo -e "  ${BOLD}Tất cả biến môi trường:${NC}"
  echo ""
  echo -e "  ${BOLD}Bắt buộc (set qua install_vi.sh):${NC}"
  echo "    WEBCAKE_API_URL        — URL API backend"
  echo "    WEBCAKE_TOKEN          — JWT Bearer token"
  echo "    WEBCAKE_SESSION_ID     — Session ID"
  echo "    WEBCAKE_SITE_ID        — ID site đích"
  echo ""
  echo -e "  ${BOLD}Tuỳ chọn (set qua script này):${NC}"
  echo "    WEBCAKE_KNOWLEDGE_DIR  — Thư mục chứa knowledge files"
  echo "    WEBCAKE_KNOWLEDGE_REPO — GitHub repo (owner/repo hoặc URL)"
  echo "    WEBCAKE_KNOWLEDGE_TOKEN— GitHub token (cho repo private)"
  echo ""
}

# ── Main ──

main() {
  print_banner

  detect_install
  detect_node

  collect_knowledge_env
  update_ides
  print_summary
}

main "$@"
