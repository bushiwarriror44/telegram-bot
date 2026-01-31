@echo off
setlocal EnableDelayedExpansion

if "%~1"=="" (
  start "PM2 Start" cmd /k "%~f0" _run
  exit /b 0
)
cd /d "%~dp0."
if not "%~1"=="_run" goto :eof
:main

echo ========================================
echo   Start Telegram Bot (PM2)
echo ========================================
echo Folder: %cd%
echo.

if not exist ".env" (
  echo ERROR: File .env not found in current folder.
  goto :eof
)

where pm2 >nul 2>&1
if errorlevel 1 (
  echo ERROR: PM2 not found. Run: npm install -g pm2
  goto :eof
)

if not exist "node_modules" (
  echo INFO: Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    goto :eof
  )
) else (
  echo INFO: node_modules exists, skipping npm install.
)

if exist "scripts\stop-all-from-cwd.js" (
  echo INFO: Stopping all PM2 processes from this folder...
  node "scripts\stop-all-from-cwd.js"
  echo.
) else (
  pm2 stop src/index.js 2>nul
)

for %%a in ("%cd%") do set "DIRNAME=%%~nxa"
if "!DIRNAME!"=="" set "DIRNAME=bot"
echo INFO: Starting pm2 (one instance per folder; name: bot-!DIRNAME!)...
for %%n in ("bot-!DIRNAME!") do pm2 start src/index.js --name "%%~n" --cwd "%cd%"
echo.
echo INFO: Bot started. Use logs.bat to view logs.
:eof
echo.
pause
endlocal
