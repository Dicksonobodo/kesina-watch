@echo off
title Dixon Watch - Live server
cd /d "%~dp0server"
echo Starting the Dixon Watch Live server. Keep this window open while people watch.
echo.
call npm run live
echo.
echo The Live server has stopped.
pause
