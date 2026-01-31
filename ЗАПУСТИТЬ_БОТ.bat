@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM При двойном клике перезапускаем себя в новом окне, которое не закроется
if "%~1"=="" (
  start "Telegram Bot - Start" cmd /k "cd /d "%~dp0" && "%~f0" _run"
  exit /b 0
)
if not "%~1"=="_run" goto :main

:main
echo ========================================
echo   Старт Telegram-бота через PM2
echo ========================================
echo Текущая папка: %cd%
echo.

if not exist ".env" (
  echo [ОШИБКА] Файл .env не найден в текущей папке!
  echo Убедись, что запускаешь скрипт из корня проекта.
  goto :eof
)

where pm2 >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] PM2 не найден.
  echo Установи: npm install -g pm2
  goto :eof
)

if not exist "node_modules" (
  echo [INFO] Устанавливаю зависимости: npm install
  call npm install
  if errorlevel 1 (
    echo [ОШИБКА] npm install завершился с ошибкой.
    goto :eof
  )
) else (
  echo [INFO] node_modules найден, пропускаю npm install.
)

REM Если боты уже запущены из этой папки — останавливаем все, иначе pm2 start выдаст ошибку
if exist "scripts\stop-all-from-cwd.js" (
  echo [INFO] Остановка всех процессов PM2 из этой папки...
  call node scripts\stop-all-from-cwd.js
  echo.
) else (
  call pm2 stop src/index.js 2>nul
)

echo [INFO] Запуск: pm2 start src/index.js --cwd "%cd%"
call pm2 start src/index.js --cwd "%cd%"

echo.
echo [INFO] Бот запущен. Логи: logs.bat
:eof
echo.
pause
endlocal
