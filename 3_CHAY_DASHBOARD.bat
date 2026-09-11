@echo off
chcp 65001 >nul
title [3/3] KHỞI ĐỘNG HIGGSFIELD QUEUE DASHBOARD (PORT 3100)
color 0A

echo =======================================================================
echo          🚀  KHỞI ĐỘNG MÁY CHỦ BẢNG ĐIỀU KHIỂN HÀNG CHỜ (PORT 3100)
echo =======================================================================
echo.
echo Đang mở trình duyệt vào http://localhost:3100...
start http://localhost:3100

echo.
echo Đang khởi động Server Node.js...
echo (Nhấn Ctrl + C để dừng máy chủ khi không sử dụng)
echo.

rem Cong cua du an — dat o day de khong phu thuoc bien PORT cua may
set HQ_PORT=3100

node server.js

pause
