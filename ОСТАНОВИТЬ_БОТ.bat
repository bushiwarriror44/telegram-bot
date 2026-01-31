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
echo   Стоп ВСЕХ ботов из текущей папки (PM2)
echo ========================================
echo Текущая папка: %cd%
echo.

where pm2 >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] PM2 не найден. Установи: npm install -g pm2
  goto :eof
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден. Установи Node.js.
  goto :eof
)

if not exist "scripts\stop-all-from-cwd.js" (
  echo [ОШИБКА] Файл scripts\stop-all-from-cwd.js не найден.
  goto :eof
)

echo [INFO] Поиск и остановка всех процессов PM2 из этой папки...
echo.
call node scripts\stop-all-from-cwd.js

echo.
echo [INFO] Готово.
:eof
echo.
pause
endlocal
