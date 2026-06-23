#!/bin/bash

# ═══════════════════════════════════════════════════════════
#  WebCake CMS MCP Server - Cập nhật
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
warn()    { echo -e "${YELLOW}[CẢNH BÁO]${NC} $1"; }
error()   { echo -e "${RED}[LỖI]${NC} $1"; }

DEFAULT_INSTALL_DIR="$HOME/.webcake-storefront-mcp"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}WebCake CMS MCP Server - Cập nhật${NC}              ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Tìm thư mục cài đặt ──

INSTALL_DIR="${1:-}"

if [ -z "$INSTALL_DIR" ]; then
  if [ -d "$DEFAULT_INSTALL_DIR" ] && [ -f "$DEFAULT_INSTALL_DIR/index.js" ]; then
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
  elif [ -f "./index.js" ] && [ -f "./api.js" ]; then
    INSTALL_DIR="$(pwd)"
  else
    error "Không tìm thấy MCP server."
    echo ""
    echo "  Cách dùng: ./update_vi.sh [đường-dẫn]"
    echo "  Ví dụ: ./update_vi.sh ~/.webcake-storefront-mcp"
    echo ""
    exit 1
  fi
fi

INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

if [ ! -f "$INSTALL_DIR/index.js" ]; then
  error "Không tìm thấy MCP server tại $INSTALL_DIR"
  exit 1
fi

info "Tìm thấy MCP server tại ${BOLD}$INSTALL_DIR${NC}"

# ── Lưu phiên bản hiện tại ──

cd "$INSTALL_DIR"

CURRENT_COMMIT=""
if [ -d ".git" ]; then
  CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  info "Phiên bản hiện tại: $CURRENT_COMMIT"
fi

# ── Pull bản mới nhất ──

if [ -d ".git" ]; then
  info "Đang tải bản mới nhất..."

  if ! git diff --quiet 2>/dev/null; then
    warn "Phát hiện thay đổi local"
    echo ""
    echo "  1) Lưu tạm (stash) và cập nhật"
    echo "  2) Ghi đè (bỏ thay đổi local)"
    echo "  3) Hủy"
    echo ""
    read -rp "  Chọn [1]: " CHOICE < /dev/tty
    CHOICE="${CHOICE:-1}"

    case "$CHOICE" in
      1)
        git stash
        success "Đã lưu tạm (khôi phục bằng: git stash pop)"
        ;;
      2)
        git checkout .
        success "Đã bỏ thay đổi local"
        ;;
      3)
        info "Đã hủy cập nhật."
        exit 0
        ;;
      *)
        error "Lựa chọn không hợp lệ"
        exit 1
        ;;
    esac
  fi

  git pull origin main 2>/dev/null || git pull 2>/dev/null
  NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

  if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
    success "Đã là bản mới nhất ($NEW_COMMIT)"
  else
    success "Đã cập nhật: $CURRENT_COMMIT → $NEW_COMMIT"

    if [ "$CURRENT_COMMIT" != "unknown" ] && [ "$NEW_COMMIT" != "unknown" ]; then
      echo ""
      info "Thay đổi:"
      git log --oneline "$CURRENT_COMMIT".."$NEW_COMMIT" 2>/dev/null | head -20 | while read -r line; do
        echo "  $line"
      done
    fi
  fi
else
  warn "Không phải git repo — không thể pull."
  echo "  Để cập nhật, cài lại từ git:"
  echo "  git clone https://github.com/vuluu2k/webcake-storefront-mcp.git $INSTALL_DIR"
  exit 1
fi

# ── Cài lại dependencies ──

info "Đang cài dependencies..."
npm install --production 2>&1 | tail -1
success "Đã cập nhật dependencies"

# ── Kiểm tra ──

info "Đang kiểm tra..."
node --check "$INSTALL_DIR/index.js" 2>/dev/null && success "Cú pháp OK" || warn "Kiểm tra cú pháp thất bại"

# ── Hoàn tất ──

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Cập nhật hoàn tất!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Khởi động lại IDE để sử dụng bản mới.${NC}"
echo ""
