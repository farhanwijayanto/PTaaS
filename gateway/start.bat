@echo off
title PTaaS Cloud Platform Console
echo ========================================================
echo   PTaaS (Penetration Testing-as-a-Service) Cloud Web App
echo   Versi 1.0 - Cloud IaaS Security Lab Platform
echo ========================================================
echo.
echo Starting local web server on port 3000...
echo.
start http://localhost:3000
node server.js
pause
