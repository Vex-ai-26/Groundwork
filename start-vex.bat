@echo off
title Vex Server
echo Starting Vex...
echo.

cd /d "%~dp0"

:: Start cloudflared tunnel in background
start "Cloudflare Tunnel" cmd /k "cloudflared.exe tunnel --url http://localhost:3001"

:: Wait 3 seconds for tunnel to init
timeout /t 3 /nobreak > nul

:: Start Vex server with nodemon
echo Vex is starting...
npx nodemon server.js
