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

where pm2 >nul 2>&1
if errorlevel 1 (
  echo ERROR: PM2 not found. Run: npm install -g pm2
  goto :eof
)

echo ========================================
echo   All bots: folder, script, status
echo   (online = green, stopped = red)
echo ========================================
echo.
if exist "%~dp0scripts\show-pm2-folders-colored.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\show-pm2-folders-colored.ps1"
) else if exist "scripts\show-pm2-folders-colored.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\show-pm2-folders-colored.ps1"
) else (
  for /L %%i in (0,1,31) do (
    pm2 show %%i 2>nul | findstr /i /c:"exec cwd" /c:"script path" >nul 2>&1
    if not errorlevel 1 (
      echo   --- Process %%i ---
      pm2 show %%i 2>nul | findstr /i /c:"status " /c:"exec cwd" /c:"script path"
      echo.
    )
  )
)
echo.
echo INFO: PM2 process table:
echo.
if exist "%APPDATA%\npm\pm2.cmd" (
  "%APPDATA%\npm\pm2.cmd" list
) else if exist "%APPDATA%\npm\pm2" (
  "%APPDATA%\npm\pm2" list
) else (
  pm2 list
)
if errorlevel 1 (
  echo ERROR: pm2 list failed.
  goto :eof
)

:eof
echo.
pause
endlocal
