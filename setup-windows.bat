@echo off
chcp 65001 >nul
echo ========================================
echo   Установка Telegram бота
echo ========================================
echo.

REM Проверка наличия PowerShell
powershell -Command "Write-Host 'Проверка PowerShell...' -ForegroundColor Yellow" 2>nul
if errorlevel 1 (
    echo [ОШИБКА] PowerShell не найден!
    echo Установите PowerShell или используйте setup-windows.ps1 напрямую
    pause
    exit /b 1
)

REM Запуск PowerShell скрипта
echo Запуск скрипта установки...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1"

if errorlevel 1 (
    echo.
    echo [ОШИБКА] Произошла ошибка при установке
    pause
    exit /b 1
)

echo.
echo Установка завершена!
pause
