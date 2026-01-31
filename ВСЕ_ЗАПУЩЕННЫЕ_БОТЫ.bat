@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM При двойном клике открываем окно, которое не закроется
if "%~1"=="" (
  start "Telegram Bot - Список процессов PM2" cmd /k "cd /d "%~dp0" && "%~f0" _run"
  exit /b 0
)
if not "%~1"=="_run" goto :main

:main
echo ========================================
echo   Список процессов PM2 (все боты)
echo ========================================
echo Текущая папка: %cd%
echo.

REM Проверяем, что pm2 доступен (через npm global или PATH)
set "PM2_CMD=pm2"
where pm2 >nul 2>&1
if errorlevel 1 (
  REM Пробуем через npx или полный путь к pm2
  if exist "%APPDATA%\npm\pm2.cmd" (
    set "PM2_CMD=%APPDATA%\npm\pm2.cmd"
  ) else if exist "%APPDATA%\npm\pm2" (
    set "PM2_CMD=%APPDATA%\npm\pm2"
  ) else (
    echo [ОШИБКА] PM2 не найден в PATH и в %%APPDATA%%\npm
    echo Установи: npm install -g pm2
    goto :eof
  )
)

echo [INFO] Таблица процессов: %PM2_CMD% list
echo.
call "%PM2_CMD%" list
if errorlevel 1 (
  echo.
  echo [ОШИБКА] Команда pm2 list завершилась с ошибкой.
  echo Проверь, что Node.js и PM2 установлены: npm install -g pm2
  goto :eof
)

REM Дополнительно выводим папку и скрипт для каждого процесса
if exist "scripts\list-pm2-with-cwd.js" (
  call node scripts\list-pm2-with-cwd.js
) else (
  echo [INFO] Скрипт scripts\list-pm2-with-cwd.js не найден.
)

:eof
echo.
pause
endlocal
