@echo off
chcp 65001 >nul
title KHỞI ĐỘNG NHANH HIGGSFIELD QUEUE (1-CLICK ALL IN ONE)
color 0A

echo =======================================================================
echo          ⚡  KHỞI ĐỘNG TOÀN BỘ HỆ THỐNG HIGGSFIELD QUEUE (1-CLICK)
echo =======================================================================
echo.

:: 1. Luồng Chrome CDP đã tắt theo yêu cầu (nếu cần dùng mở riêng bằng 2_MO_CHROME_HIGGSFIELD.bat)
rem powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-cdp.ps1"

:: 2. Mở trình duyệt vào Dashboard
echo Đang mở Dashboard tại http://localhost:3100...
start http://localhost:3100

:: 3. Khởi động Node server
echo Đang khởi động Server Node.js...
echo.
echo =======================================================================
echo  🌐 Dashboard: http://localhost:3100
echo  💤 Chrome CDP: Đã tắt (không tự kích hoạt)
echo  (Giữ cửa sổ này mở để duy trì hàng chờ. Nhấn Ctrl + C để dừng)
echo =======================================================================
echo.

rem Cong cua du an — dat o day de khong phu thuoc bien PORT cua may
set HQ_PORT=3100

node server.js

pause
