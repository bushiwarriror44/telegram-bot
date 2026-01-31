@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

if "%~1"=="" (
  start "Telegram Bot - Delete" cmd /k "cd /d "%~dp0" && "%~f0" _run"
  exit /b 0
)
if not "%~1"=="_run" goto :main

:main
echo ========================================
echo   Удаление бота из PM2
echo ========================================
echo Текущая папка: %cd%
echo.

where pm2 >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] PM2 не найден. Установи: npm install -g pm2
  goto :eof
)

echo [INFO] Удаление процесса: pm2 delete src/index.js
call pm2 delete src/index.js 2>nul
if errorlevel 1 (
  echo [INFO] Процесс не найден или уже удалён.
) else (
  echo [INFO] Бот удалён из PM2.
)
:eof
echo.
pause
endlocal
