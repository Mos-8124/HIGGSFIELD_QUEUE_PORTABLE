#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================================="
echo "         ⚡  KHỞI ĐỘNG TOÀN BỘ HỆ THỐNG HIGGSFIELD QUEUE (1-CLICK)"
echo "======================================================================="
echo ""

# 1. Luồng Chrome CDP đã tắt theo yêu cầu (nếu cần dùng mở riêng bằng start-cdp.sh)
# bash "$SCRIPT_DIR/start-cdp.sh"

# Kiểm tra và giải phóng port 3100 nếu tiến trình cũ chưa tắt hẳn
if command -v fuser >/dev/null 2>&1; then
    fuser -k 3100/tcp >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
    lsof -ti :3100 | xargs -r kill -9 >/dev/null 2>&1 || true
fi

# 2. Khởi động Node server
echo ""
echo "Đang khởi động Server Node.js..."
echo "======================================================================="
echo "  🌐 Dashboard: http://localhost:3100"
echo "  💤 Chrome CDP: Đã tắt (không tự kích hoạt)"
echo "  (Giữ cửa sổ này mở để duy trì hàng chờ. Nhấn Ctrl + C để dừng)"
echo "======================================================================="
echo ""

# Cong cua du an — dat o day de khong phu thuoc bien PORT cua may
export HQ_PORT=3100

node server.js
