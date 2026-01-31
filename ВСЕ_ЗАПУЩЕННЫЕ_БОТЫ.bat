@echo off
setlocal EnableDelayedExpansion

if "%~1"=="" (
  start "PM2 List" cmd /k "%~f0" _run
  exit /b 0
)
cd /d "%~dp0."
if not "%~1"=="_run" goto :eof
:main

echo ========================================
echo   PM2 Process List (all bots)
echo ========================================
echo Folder: %cd%
echo.

echo INFO: PM2 process table:
echo.
where pm2 >nul 2>&1
if errorlevel 1 (
  if exist "%APPDATA%\npm\pm2.cmd" (
    "%APPDATA%\npm\pm2.cmd" list
  ) else if exist "%APPDATA%\npm\pm2" (
    "%APPDATA%\npm\pm2" list
  ) else (
    echo ERROR: PM2 not found. Run: npm install -g pm2
    goto :eof
  )
) else (
  pm2 list
)
if errorlevel 1 (
  echo ERROR: pm2 list failed.
  goto :eof
)

echo.
echo ========================================
echo   All running bots: folder and script
echo ========================================
echo.
if exist "%~dp0scripts\list-pm2-with-cwd.js" (
  node "%~dp0scripts\list-pm2-with-cwd.js"
) else if exist "scripts\list-pm2-with-cwd.js" (
  node "scripts\list-pm2-with-cwd.js"
) else (
  echo INFO: scripts\list-pm2-with-cwd.js not found. Run this bat from project folder.
)

:eof
echo.
pause
endlocal
