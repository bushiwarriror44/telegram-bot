@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM При двойном клике открываем окно, которое не закроется
if "%~1"=="" (
  start "PM2 List" cmd /k "%~f0" _run
  exit /b 0
)
cd /d "%~dp0."
if not "%~1"=="_run" goto :eof
:main
echo ========================================
echo   Список процессов PM2 (все боты)
echo ========================================
echo Текущая папка: %cd%
echo.

REM Проверяем, что pm2 доступен, и вызываем без переменной (чтобы не было ошибки _CMD / "")
echo [INFO] Таблица процессов PM2:
echo.
where pm2 >nul 2>&1
if errorlevel 1 (
  if exist "%APPDATA%\npm\pm2.cmd" (
    call "%APPDATA%\npm\pm2.cmd" list
  ) else if exist "%APPDATA%\npm\pm2" (
    call "%APPDATA%\npm\pm2" list
  ) else (
    echo [ОШИБКА] PM2 не найден. Установи: npm install -g pm2
    goto :eof
  )
) else (
  call pm2 list
)
if errorlevel 1 (
  echo [ОШИБКА] Команда pm2 list завершилась с ошибкой.
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
