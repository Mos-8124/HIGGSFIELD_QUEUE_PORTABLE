#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================================="
echo "         ⚡  KHỞI ĐỘNG TOÀN BỘ HỆ THỐNG HIGGSFIELD QUEUE (1-CLICK)"
echo "======================================================================="
echo ""

# 1. Khởi động Chrome CDP
echo "[1/2] Đang mở Chrome CDP (Port 9333)..."
bash "$SCRIPT_DIR/start-cdp.sh"

sleep 1

# Kiểm tra và giải phóng port 20140 nếu tiến trình cũ chưa tắt hẳn
if command -v fuser >/dev/null 2>&1; then
    fuser -k 20140/tcp >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
    lsof -ti :20140 | xargs -r kill -9 >/dev/null 2>&1 || true
fi

# 2. Khởi động Node server
echo ""
echo "[2/2] Đang khởi động Server Node.js..."
echo "======================================================================="
echo "  🌐 Dashboard: http://localhost:20140"
echo "  📡 Chrome CDP: http://127.0.0.1:9333"
echo "  (Giữ cửa sổ này mở để duy trì hàng chờ. Nhấn Ctrl + C để dừng)"
echo "======================================================================="
echo ""

# Cong cua du an — dat o day de khong phu thuoc bien PORT cua may
export HQ_PORT=20140

node server.js
