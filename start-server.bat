@echo off
REM Starts the Dixon Watch detection server and a Cloudflare tunnel in two windows.
REM Copy the https://....trycloudflare.com address from the tunnel window into Vercel (VITE_API_URL) and redeploy.
cd /d "%~dp0"
start "Dixon Watch server" cmd /k npm run server
timeout /t 5 /nobreak >nul
start "Dixon Watch tunnel" cmd /k npm run tunnel
