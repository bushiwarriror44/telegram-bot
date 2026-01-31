@echo off
setlocal EnableDelayedExpansion

if "%~1"=="" (
  start "PM2 Logs" cmd /k "%~f0" _run
  exit /b 0
)
cd /d "%~dp0."
if not "%~1"=="_run" goto :eof
:main

echo ========================================
echo   PM2 Logs (Telegram Bot)
echo ========================================
echo Folder: %cd%
echo.

where pm2 >nul 2>&1
if errorlevel 1 (
  echo ERROR: PM2 not found. Run: npm install -g pm2
  goto :eof
)

echo INFO: Process list:
pm2 list
echo.
echo INFO: Last 200 lines, then live stream. Press Ctrl+C to exit.
echo.

pm2 logs --lines 200
:eof
echo.
pause
endlocal
