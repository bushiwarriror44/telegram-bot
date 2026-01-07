# Инструкция по развертыванию на Linux-сервере

## Требования

- Linux-сервер (Ubuntu/Debian/CentOS)
- Node.js версии 18.x или выше
- npm (обычно устанавливается вместе с Node.js)
- Git (для клонирования репозитория, если нужно)

## Шаг 1: Подключение к серверу

Подключитесь к вашему удаленному серверу через SSH:
```bash
ssh username@your-server-ip
```

## Шаг 2: Установка Node.js (если не установлен)

### Для Ubuntu/Debian:
```bash
# Обновление списка пакетов
sudo apt update

# Установка Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версии
node --version
npm --version
```

### Для CentOS/RHEL:
```bash
# Установка Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Проверка версии
node --version
npm --version
```

## Шаг 3: Загрузка проекта на сервер

### Вариант A: Клонирование из Git-репозитория
```bash
# Переход в домашнюю директорию или создание директории для проектов
cd ~
mkdir -p projects
cd projects

# Клонирование репозитория (замените URL на ваш)
git clone https://github.com/your-username/telegram-bot.git
cd telegram-bot
```

### Вариант B: Загрузка через SCP (с локального компьютера)
```bash
# С вашего локального компьютера (Windows PowerShell)
scp -r C:\Users\PC\Desktop\telegram-bot username@your-server-ip:~/
```

Затем на сервере:
```bash
cd ~/telegram-bot
```

## Шаг 4: Установка зависимостей

```bash
# Установка всех зависимостей проекта
npm install
```

## Шаг 5: Настройка переменных окружения

Создайте файл `.env` в корне проекта:
```bash
nano .env
```

Добавьте следующие переменные (замените значения на свои):
```env
BOT_TOKEN=your_bot_token_here
ADMIN_PASSWORD=your_secure_password_here
DB_PATH=./database/bot.db
```

Сохраните файл (Ctrl+O, Enter, Ctrl+X в nano).

**Важно:** 
- Получите `BOT_TOKEN` от [@BotFather](https://t.me/BotFather) в Telegram
- Используйте надежный пароль для `ADMIN_PASSWORD`

## Шаг 6: Создание директории для базы данных

```bash
# Создание директории (если её нет)
mkdir -p database
```

## Шаг 7: Установка PM2 (рекомендуется для production)

PM2 - это процесс-менеджер для Node.js, который обеспечит:
- Автоматический перезапуск при сбоях
- Запуск при перезагрузке сервера
- Логирование
- Мониторинг

```bash
# Установка PM2 глобально
sudo npm install -g pm2

# Запуск бота через PM2
pm2 start src/index.js --name telegram-bot

# Сохранение конфигурации PM2 для автозапуска
pm2 save
pm2 startup
# Выполните команду, которую выведет pm2 startup (обычно это sudo команда)
```

## Шаг 8: Управление ботом через PM2

### Полезные команды PM2:
```bash
# Просмотр статуса
pm2 status

# Просмотр логов
pm2 logs telegram-bot

# Просмотр логов в реальном времени
pm2 logs telegram-bot --lines 50

# Перезапуск бота
pm2 restart telegram-bot

# Остановка бота
pm2 stop telegram-bot

# Удаление из PM2
pm2 delete telegram-bot

# Мониторинг (CPU, память)
pm2 monit
```

## Альтернатива: Запуск без PM2 (не рекомендуется для production)

Если вы не хотите использовать PM2, можно запустить бота напрямую:

```bash
# Запуск в фоновом режиме
nohup npm start > bot.log 2>&1 &

# Или с использованием screen/tmux
screen -S telegram-bot
npm start
# Нажмите Ctrl+A, затем D для отсоединения от сессии
```

## Шаг 9: Проверка работы бота

1. Проверьте логи:
```bash
pm2 logs telegram-bot --lines 20
```

2. Откройте бота в Telegram и отправьте команду `/start`

3. Проверьте, что бот отвечает

## Шаг 10: Настройка файрвола (если нужно)

Бот не требует открытых портов, так как использует webhook/polling через Telegram API. Но если вы используете другие сервисы, убедитесь, что файрвол настроен правильно.

## Обновление бота

Когда нужно обновить код бота:

```bash
# Остановка бота
pm2 stop telegram-bot

# Обновление кода (если используете Git)
git pull

# Или загрузите новые файлы через SCP

# Переустановка зависимостей (если изменился package.json)
npm install

# Перезапуск бота
pm2 restart telegram-bot

# Проверка логов
pm2 logs telegram-bot
```

## Резервное копирование базы данных

Рекомендуется регулярно делать резервные копии базы данных:

```bash
# Создание резервной копии
cp database/bot.db database/bot.db.backup-$(date +%Y%m%d-%H%M%S)

# Или добавьте в cron для автоматического бэкапа
crontab -e
# Добавьте строку (бэкап каждый день в 3:00)
0 3 * * * cp /path/to/telegram-bot/database/bot.db /path/to/backups/bot.db.backup-$(date +\%Y\%m\%d)
```

## Устранение проблем

### Бот не запускается
```bash
# Проверьте логи
pm2 logs telegram-bot

# Проверьте переменные окружения
cat .env

# Проверьте, что Node.js установлен
node --version
```

### Ошибка с правами доступа
```bash
# Убедитесь, что у пользователя есть права на запись в директорию database
chmod -R 755 database
```

### Бот падает
```bash
# Проверьте логи на наличие ошибок
pm2 logs telegram-bot --err

# Проверьте использование ресурсов
pm2 monit
```

## Быстрый старт (краткая версия команд)

```bash
# 1. Установка Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Загрузка проекта (замените путь)
cd ~
# Загрузите проект через SCP или Git

# 3. Установка зависимостей
cd telegram-bot
npm install

# 4. Создание .env файла
nano .env
# Добавьте: BOT_TOKEN=..., ADMIN_PASSWORD=..., DB_PATH=./database/bot.db

# 5. Создание директории для БД
mkdir -p database

# 6. Установка и запуск через PM2
sudo npm install -g pm2
pm2 start src/index.js --name telegram-bot
pm2 save
pm2 startup
# Выполните команду, которую выведет pm2 startup

# 7. Проверка
pm2 status
pm2 logs telegram-bot
```

## Дополнительные рекомендации

1. **Используйте отдельного пользователя для бота** (не root):
```bash
sudo adduser telegrambot
sudo su - telegrambot
# Затем выполните все команды от этого пользователя
```

2. **Настройте мониторинг** - используйте PM2 Plus или другие инструменты для мониторинга

3. **Настройте ротацию логов** - PM2 может создавать большие логи, настройте их ротацию

4. **Используйте SSL/TLS** если бот использует webhook (в данном проекте используется polling, поэтому не требуется)

