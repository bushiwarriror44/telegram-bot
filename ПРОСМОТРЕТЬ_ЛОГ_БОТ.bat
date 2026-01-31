@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

if "%~1"=="" (
  start "Telegram Bot - Logs" cmd /k "cd /d "%~dp0" && "%~f0" _run"
  exit /b 0
)
if not "%~1"=="_run" goto :main

:main
echo ========================================
echo   Логи Telegram-бота (PM2)
echo ========================================
echo Текущая папка: %cd%
echo.

where pm2 >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] PM2 не найден. Установи: npm install -g pm2
  goto :eof
)

echo [INFO] Список процессов PM2:
call pm2 list
echo.
echo [INFO] Логи (последние 300 строк, затем поток). Ctrl+C для выхода.
echo.

REM Сначала выводим последние строки без потока (--nostream), чтобы сразу увидеть логи
call pm2 logs --lines 300 --nostream
echo.
echo --- Live: новые строки будут появляться ниже (Ctrl+C для выхода) ---
call pm2 logs --lines 100
:eof
echo.
pause
endlocal
