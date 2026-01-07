import { Telegraf } from 'telegraf';
import { config } from './config/index.js';
import { database } from './database/db.js';
import { setupUserHandlers } from './handlers/userHandlers.js';
import { setupAdminHandlers } from './handlers/adminHandlers.js';
import { initializeMockData } from './utils/mockData.js';

async function startBot() {
  try {
    // Инициализация базы данных
    console.log('Инициализация базы данных...');
    await database.init();
    console.log('База данных инициализирована');

    // Инициализация моковых данных
    await initializeMockData();

    // Проверка токена бота
    if (!config.botToken) {
      throw new Error('BOT_TOKEN не установлен в переменных окружения!');
    }

    // Создание экземпляра бота
    const bot = new Telegraf(config.botToken);

    // Настройка обработчиков (сначала админ, чтобы его обработчики текста выполнялись первыми)
    setupAdminHandlers(bot);
    setupUserHandlers(bot);

    // Обработка ошибок
    bot.catch((err, ctx) => {
      console.error('Ошибка в боте:', err);
      ctx.reply('Произошла ошибка. Попробуйте позже.');
    });

    // Запуск бота
    await bot.launch();
    console.log('Бот успешно запущен!');

    // Graceful shutdown
    process.once('SIGINT', () => {
      console.log('Получен SIGINT, останавливаем бота...');
      bot.stop('SIGINT');
      database.close();
    });
    process.once('SIGTERM', () => {
      console.log('Получен SIGTERM, останавливаем бота...');
      bot.stop('SIGTERM');
      database.close();
    });

  } catch (error) {
    console.error('Критическая ошибка при запуске бота:', error);
    process.exit(1);
  }
}

startBot();

