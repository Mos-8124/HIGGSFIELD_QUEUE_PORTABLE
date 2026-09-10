@echo off
chcp 65001 >nul
title MỞ PORT 20140 TRÊN WINDOWS FIREWALL (CHO MẠNG NỘI BỘ LAN)
color 0A

echo =======================================================================
echo   🛡️  TỰ ĐỘNG MỞ PORT 20140 CHO PHÉP MÁY KHÁC TRONG LAN TRUY CẬP
echo =======================================================================
echo.
echo Yêu cầu quyền Administrator để cấu hình Windows Firewall...
echo.

netsh advfirewall firewall add rule name="GTF Video AI Studio (Port 20140)" dir=in action=allow protocol=TCP localport=20140

if %ERRORLEVEL% equ 0 (
    echo.
    echo =======================================================================
    echo ✅ THÀNH CÔNG! Port 20140 đã được mở trên Windows Firewall.
    echo 👉 Mọi máy tính/điện thoại trong cùng mạng Wi-Fi/LAN công ty giờ có thể
    echo    truy cập vào: http://192.168.1.25:20140/deeplove
    echo =======================================================================
) else (
    echo.
    echo ❌ THẤT BẠI: Bạn cần nhấp chuột phải vào file này và chọn "Run as administrator" (Chạy với quyền quản trị).
)

echo.
pause
