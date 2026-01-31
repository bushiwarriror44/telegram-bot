@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

if "%~1"=="" (
  start "PM2 Stop" cmd /k "%~f0" _run
  exit /b 0
)
cd /d "%~dp0."
if not "%~1"=="_run" goto :eof
:main

echo ========================================
echo   Stop ALL bots from this folder (PM2)
echo ========================================
echo Folder: %cd%
echo.

where pm2 >nul 2>&1
if errorlevel 1 (
  echo ERROR: PM2 not found. Run: npm install -g pm2
  goto :eof
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found.
  goto :eof
)

if exist "scripts\stop-all-from-cwd.js" (
  echo INFO: Stopping all PM2 processes from this folder...
  call node "scripts\stop-all-from-cwd.js"
) else (
  echo WARN: scripts\stop-all-from-cwd.js not found. Stopping src/index.js...
  call pm2 stop src/index.js 2>nul
)

echo.
echo INFO: Done.
:eof
echo.
pause
endlocal
