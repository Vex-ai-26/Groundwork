@echo off
echo ==========================================
echo   GROUNDWORK - Starting Vex + Tunnel
echo ==========================================

echo [1/2] Starting Vex server on port 3001...
start "Vex Server" cmd /k "cd /d %~dp0 && node server.js"

timeout /t 2 /nobreak > nul

echo [2/2] Starting Cloudflare tunnel...
start "CF Tunnel" cmd /k "cloudflared tunnel run groundwork"

echo.
echo Vex is live at: https://vex.vex-ai.com
echo Health check:   https://vex.vex-ai.com/health
echo.
pause
