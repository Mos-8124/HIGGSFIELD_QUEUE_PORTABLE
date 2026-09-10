@echo off
chcp 65001 >nul
title [3/3] KHỞI ĐỘNG HIGGSFIELD QUEUE DASHBOARD (PORT 20140)
color 0A

echo =======================================================================
echo          🚀  KHỞI ĐỘNG MÁY CHỦ BẢNG ĐIỀU KHIỂN HÀNG CHỜ (PORT 20140)
echo =======================================================================
echo.
echo Đang mở trình duyệt vào http://localhost:20140...
start http://localhost:20140

echo.
echo Đang khởi động Server Node.js...
echo (Nhấn Ctrl + C để dừng máy chủ khi không sử dụng)
echo.

rem Cong cua du an — dat o day de khong phu thuoc bien PORT cua may
set HQ_PORT=20140

node server.js

pause
