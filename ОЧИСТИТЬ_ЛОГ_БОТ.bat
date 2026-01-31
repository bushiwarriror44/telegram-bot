@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

if "%~1"=="" (
  start "PM2 Clear Logs" cmd /k "%~f0" _run
  exit /b 0
)
cd /d "%~dp0."
if not "%~1"=="_run" goto :eof
:main

echo ========================================
echo   Clear PM2 Logs
echo ========================================
echo Folder: %cd%
echo.

where pm2 >nul 2>&1
if errorlevel 1 (
  echo ERROR: PM2 not found. Run: npm install -g pm2
  goto :eof
)

echo INFO: Clearing logs with pm2 flush...
call pm2 flush

echo.
echo INFO: Logs cleared.
:eof
echo.
pause
endlocal
