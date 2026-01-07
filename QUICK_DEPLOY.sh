#!/bin/bash
# Скрипт быстрого развертывания Telegram бота на Linux-сервере
# Использование: bash QUICK_DEPLOY.sh

set -e  # Остановка при ошибке

echo "=== Развертывание Telegram бота ==="

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js не установлен. Установка Node.js 18.x..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "Node.js уже установлен: $(node --version)"
fi

# Проверка npm
if ! command -v npm &> /dev/null; then
    echo "npm не установлен!"
    exit 1
else
    echo "npm версия: $(npm --version)"
fi

# Установка зависимостей
echo "Установка зависимостей проекта..."
npm install

# Создание директории для базы данных
echo "Создание директории для базы данных..."
mkdir -p database

# Проверка файла .env
if [ ! -f .env ]; then
    echo "Файл .env не найден!"
    echo "Создайте файл .env со следующим содержимым:"
    echo "BOT_TOKEN=your_bot_token_here"
    echo "ADMIN_PASSWORD=your_secure_password_here"
    echo "DB_PATH=./database/bot.db"
    echo ""
    read -p "Создать файл .env сейчас? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Введите BOT_TOKEN: " BOT_TOKEN
        read -p "Введите ADMIN_PASSWORD: " ADMIN_PASSWORD
        cat > .env << EOF
BOT_TOKEN=$BOT_TOKEN
ADMIN_PASSWORD=$ADMIN_PASSWORD
DB_PATH=./database/bot.db
EOF
        echo "Файл .env создан!"
    else
        echo "Создайте файл .env вручную перед запуском бота!"
        exit 1
    fi
else
    echo "Файл .env найден"
fi

# Установка PM2
if ! command -v pm2 &> /dev/null; then
    echo "Установка PM2..."
    sudo npm install -g pm2
else
    echo "PM2 уже установлен"
fi

# Запуск бота через PM2
echo "Запуск бота через PM2..."
pm2 start src/index.js --name telegram-bot || pm2 restart telegram-bot

# Сохранение конфигурации PM2
pm2 save

echo ""
echo "=== Развертывание завершено! ==="
echo ""
echo "Полезные команды:"
echo "  pm2 status              - статус бота"
echo "  pm2 logs telegram-bot   - просмотр логов"
echo "  pm2 restart telegram-bot - перезапуск бота"
echo "  pm2 stop telegram-bot   - остановка бота"
echo ""
echo "Настройка автозапуска при перезагрузке сервера:"
echo "  pm2 startup"
echo "  # Выполните команду, которую выведет pm2 startup"
echo ""

