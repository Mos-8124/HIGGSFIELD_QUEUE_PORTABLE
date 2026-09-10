@echo off
chcp 65001 >nul
title MỞ CỔNG TRUY CẬP INTERNET / TỪ XA CHO GTF VIDEO AI STUDIO (PORT 20140)
color 0B

echo =======================================================================
echo     🌐 MỞ CỔNG TRUY CẬP TỪ XA / INTERNET CHO ĐỒNG NGHIỆP TRONG CÔNG TY
echo =======================================================================
echo.
echo Đang tạo đường hầm bảo mật kết nối tới cổng 20140...
echo (Đồng nghiệp ở nhà, dùng 4G hoặc khác mạng Wi-Fi đều có thể truy cập được)
echo.
echo LƯU Ý:
echo - Hãy giữ cửa sổ này luôn mở khi muốn chia sẻ link ra ngoài.
echo - Khi đồng nghiệp lần đầu mở link, nếu có hỏi "Tunnel Password / IP",
echo   hãy bảo họ nhập địa chỉ IP mạng công khai của máy chủ (xem tại: https://loca.lt/mytunnelpassword)
echo.
echo =======================================================================
echo.

npx.cmd localtunnel --port 20140

pause
