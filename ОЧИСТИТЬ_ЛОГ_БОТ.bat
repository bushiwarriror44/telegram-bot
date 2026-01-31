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
echo   Очистка логов PM2
echo ========================================
echo Текущая папка: %cd%
echo.

where pm2 >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] PM2 не найден. Установи: npm install -g pm2
  goto :eof
)

echo [INFO] Очистка логов: pm2 flush
call pm2 flush

echo.
echo [INFO] Логи очищены.
:eof
echo.
pause
endlocal
