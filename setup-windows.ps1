# Скрипт автоматической установки и настройки Telegram бота для Windows
# Запуск: PowerShell -ExecutionPolicy Bypass -File .\setup-windows.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Установка Telegram бота" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Функция проверки установки программы
function Test-Command {
    param($Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Функция проверки версии Node.js
function Get-NodeVersion {
    try {
        $version = node --version 2>$null
        return $version
    } catch {
        return $null
    }
}

# Функция проверки версии npm
function Get-NpmVersion {
    try {
        $version = npm --version 2>$null
        return $version
    } catch {
        return $null
    }
}

# Функция проверки версии PM2
function Get-Pm2Version {
    try {
        $version = pm2 --version 2>$null
        return $version
    } catch {
        return $null
    }
}

# Проверка и установка Node.js
Write-Host "[1/5] Проверка Node.js..." -ForegroundColor Yellow
$nodeVersion = Get-NodeVersion
if ($nodeVersion) {
    Write-Host "  ✓ Node.js установлен: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  ✗ Node.js не установлен" -ForegroundColor Red
    Write-Host ""
    Write-Host "Для установки Node.js:" -ForegroundColor Yellow
    Write-Host "  1. Скачайте установщик с https://nodejs.org/" -ForegroundColor White
    Write-Host "  2. Установите Node.js (рекомендуется LTS версия)" -ForegroundColor White
    Write-Host "  3. Перезапустите этот скрипт" -ForegroundColor White
    Write-Host ""
    $continue = Read-Host "Продолжить установку остальных компонентов? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "Установка прервана." -ForegroundColor Red
        exit 1
    }
}

# Проверка и установка npm
Write-Host "[2/5] Проверка npm..." -ForegroundColor Yellow
$npmVersion = Get-NpmVersion
if ($npmVersion) {
    Write-Host "  ✓ npm установлен: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "  ✗ npm не установлен" -ForegroundColor Red
    Write-Host "  npm обычно устанавливается вместе с Node.js" -ForegroundColor Yellow
    Write-Host "  Установите Node.js, чтобы получить npm" -ForegroundColor Yellow
}

# Проверка и установка PM2
Write-Host "[3/5] Проверка PM2..." -ForegroundColor Yellow
$pm2Version = Get-Pm2Version
if ($pm2Version) {
    Write-Host "  ✓ PM2 установлен: $pm2Version" -ForegroundColor Green
} else {
    Write-Host "  ✗ PM2 не установлен" -ForegroundColor Red
    Write-Host "  Установка PM2..." -ForegroundColor Yellow
    try {
        npm install -g pm2
        Write-Host "  ✓ PM2 успешно установлен" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Ошибка при установке PM2: $_" -ForegroundColor Red
        Write-Host "  Попробуйте установить вручную: npm install -g pm2" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Настройка конфигурации" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Запрос данных для .env файла
Write-Host "Введите данные для файла .env:" -ForegroundColor Yellow
Write-Host ""

# BOT_TOKEN
Write-Host "BOT_TOKEN - Токен(ы) бота из @BotFather" -ForegroundColor Cyan
Write-Host "  Можно указать несколько токенов через запятую" -ForegroundColor Gray
Write-Host "  Пример: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz,9876543210:XYZuvwSTUqrsPONmlkjIHGfedcba" -ForegroundColor Gray
$botToken = Read-Host "  BOT_TOKEN"
while ([string]::IsNullOrWhiteSpace($botToken)) {
    Write-Host "  Токен не может быть пустым!" -ForegroundColor Red
    $botToken = Read-Host "  BOT_TOKEN"
}

# ADMIN_PASSWORD
Write-Host ""
Write-Host "ADMIN_PASSWORD - Пароль для доступа к админ-панели" -ForegroundColor Cyan
$adminPassword = Read-Host "  ADMIN_PASSWORD (по умолчанию: password123)"
if ([string]::IsNullOrWhiteSpace($adminPassword)) {
    $adminPassword = "password123"
    Write-Host "  Используется значение по умолчанию: password123" -ForegroundColor Gray
}

# CAPTCHA_ENABLED
Write-Host ""
Write-Host "CAPTCHA_ENABLED - Включить капчу при /start" -ForegroundColor Cyan
Write-Host "  Введите TRUE для включения или FALSE для отключения" -ForegroundColor Gray
$captchaEnabled = Read-Host "  CAPTCHA_ENABLED (по умолчанию: FALSE)"
if ([string]::IsNullOrWhiteSpace($captchaEnabled)) {
    $captchaEnabled = "FALSE"
    Write-Host "  Используется значение по умолчанию: FALSE" -ForegroundColor Gray
} else {
    $captchaEnabled = $captchaEnabled.ToUpper()
    if ($captchaEnabled -ne "TRUE" -and $captchaEnabled -ne "FALSE") {
        Write-Host "  Неверное значение, используется FALSE" -ForegroundColor Yellow
        $captchaEnabled = "FALSE"
    }
}

# DB_PATH
Write-Host ""
Write-Host "DB_PATH - Путь к файлу базы данных" -ForegroundColor Cyan
Write-Host "  Можно оставить по умолчанию (рекомендуется)" -ForegroundColor Gray
$dbPath = Read-Host "  DB_PATH (по умолчанию: ./database/bot.db)"
if ([string]::IsNullOrWhiteSpace($dbPath)) {
    $dbPath = "./database/bot.db"
    Write-Host "  Используется значение по умолчанию: ./database/bot.db" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Создание .env файла" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Создание .env файла
$envContent = @"
BOT_TOKEN=$botToken
ADMIN_PASSWORD=$adminPassword
DB_PATH=$dbPath
CAPTCHA_ENABLED=$captchaEnabled
"@

try {
    $envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
    Write-Host "✓ Файл .env успешно создан" -ForegroundColor Green
    Write-Host ""
    Write-Host "Содержимое .env файла:" -ForegroundColor Yellow
    Write-Host $envContent -ForegroundColor Gray
} catch {
    Write-Host "✗ Ошибка при создании .env файла: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Установка зависимостей" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Проверка наличия package.json
if (-not (Test-Path "package.json")) {
    Write-Host "✗ Файл package.json не найден!" -ForegroundColor Red
    Write-Host "Убедитесь, что вы запускаете скрипт из корневой директории проекта" -ForegroundColor Yellow
    exit 1
}

# Установка зависимостей
Write-Host "Установка npm зависимостей..." -ForegroundColor Yellow
try {
    npm install
    Write-Host "✓ Зависимости успешно установлены" -ForegroundColor Green
} catch {
    Write-Host "✗ Ошибка при установке зависимостей: $_" -ForegroundColor Red
    Write-Host "Попробуйте установить вручную: npm install" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Установка завершена!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Следующие шаги:" -ForegroundColor Yellow
Write-Host "  1. Проверьте файл .env и при необходимости отредактируйте его" -ForegroundColor White
Write-Host "  2. Запустите бота командой: npm start" -ForegroundColor White
Write-Host "  3. Или запустите с PM2: pm2 start src/index.js --name telegram-bot" -ForegroundColor White
Write-Host "  4. Для просмотра логов PM2: pm2 logs telegram-bot" -ForegroundColor White
Write-Host ""
Write-Host "Для остановки бота (если запущен через PM2):" -ForegroundColor Yellow
Write-Host "  pm2 stop telegram-bot" -ForegroundColor White
Write-Host ""
Write-Host "Для удаления бота из PM2:" -ForegroundColor Yellow
Write-Host "  pm2 delete telegram-bot" -ForegroundColor White
Write-Host ""
