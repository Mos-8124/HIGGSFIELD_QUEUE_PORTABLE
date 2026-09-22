@echo off
chcp 65001 >nul
title MO CHROME GOOGLE FLOW (PORT 9334)
rem Chrome CDP danh rieng cho Flow Queue (GTF). Cong 9334 — ne 9222 va ne 9333 (V1 Higgsfield).
rem Profile rieng vi Chrome moi khong cho mo debug port tren profile Default.
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set "FLOW_USER_DATA=%LOCALAPPDATA%\GTF\GoogleFlowChrome"
if not exist "%FLOW_USER_DATA%" mkdir "%FLOW_USER_DATA%"
echo Dang mo Chrome Google Flow voi cong CDP 9334 (chi bind 127.0.0.1)...
echo Profile: %FLOW_USER_DATA%
echo LAN DAU TIEN: hay dang nhap Google trong cua so nay (chi can 1 lan).
start "GTF Google Flow (CDP 9334)" "%CHROME_EXE%" --remote-debugging-port=9334 --user-data-dir="%FLOW_USER_DATA%" "https://labs.google/fx/vi/tools/flow"
