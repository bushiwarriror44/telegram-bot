@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

if "%~1"=="" (
  start "PM2 Delete" cmd /k "%~f0" _run
  exit /b 0
)
cd /d "%~dp0."
if not "%~1"=="_run" goto :eof
:main

echo ========================================
echo   Delete bot from PM2
echo ========================================
echo Folder: %cd%
echo.

where pm2 >nul 2>&1
if errorlevel 1 (
  echo ERROR: PM2 not found. Run: npm install -g pm2
  goto :eof
)

echo INFO: Deleting process src/index.js...
call pm2 delete src/index.js 2>nul
if errorlevel 1 (
  echo INFO: Process not found or already deleted.
) else (
  echo INFO: Bot deleted from PM2.
)
:eof
echo.
pause
endlocal
