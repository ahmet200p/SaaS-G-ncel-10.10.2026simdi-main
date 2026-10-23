@echo off
title B2B Multi-Tenant SaaS Sunucusu
echo ====================================================
echo    B2B MULTI-TENANT YEDEK PARCA SAAS SUNUCUSU
echo ====================================================
echo.
echo Sunucu ve Arayuzler baslatiliyor...
echo   - Backend REST API:  http://localhost:5000
echo   - Frontend Portali:   http://localhost:5500
echo.
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
)

rem Tarayicida guvenli sekilde acilmasi icin tetikleyici (2 sn sonra localhost:5500/saas-panel-ui/login.html acilir)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5500/saas-panel-ui/login.html"

node server.js

if %errorlevel% neq 0 (
    echo.
    echo [HATA] Sunucu beklenmeyen sekilde kapandi.
    echo.
    pause
)


