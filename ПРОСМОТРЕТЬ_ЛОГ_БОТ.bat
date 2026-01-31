@echo off
chcp 65001 >nul
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
call pm2 list
echo.
echo INFO: Last 300 lines, then live stream. Press Ctrl+C to exit.
echo.

call pm2 logs --lines 300 --nostream
echo.
echo --- Live stream below. Press Ctrl+C to exit ---
call pm2 logs --lines 100
:eof
echo.
pause
endlocal
