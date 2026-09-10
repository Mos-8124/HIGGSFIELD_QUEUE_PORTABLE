#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================================="
echo "         🚀  KHỞI ĐỘNG MÁY CHỦ BẢNG ĐIỀU KHIỂN HÀNG CHỜ (PORT 20140)"
echo "======================================================================="
echo ""

# Kiểm tra và giải phóng port 20140 nếu tiến trình cũ chưa tắt hẳn
if command -v fuser >/dev/null 2>&1; then
    fuser -k 20140/tcp >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
    lsof -ti :20140 | xargs -r kill -9 >/dev/null 2>&1 || true
fi

echo "Máy chủ bảng điều khiển sẽ chạy tại: http://localhost:20140"
echo "Đang khởi động Server Node.js..."
echo "(Nhấn Ctrl + C để dừng máy chủ khi không sử dụng)"
echo ""

# Cong cua du an — dat o day de khong phu thuoc bien PORT cua may
export HQ_PORT=20140

node server.js
