import { Telegraf } from 'telegraf';
import { config } from './config/index.js';
import { database } from './database/db.js';
import { setupUserHandlers } from './handlers/userHandlers.js';
import { setupAdminHandlers } from './handlers/adminHandlers.js';
import { initializeMockData } from './utils/mockData.js';

async function startBot() {
  try {
    console.log('[START] ========== Запуск бота ==========');
    console.log('[START] Время:', new Date().toISOString());

    // Инициализация базы данных
    console.log('[START] Шаг 1: Инициализация базы данных...');
    await database.init();
    console.log('[START] Шаг 1 завершен: База данных инициализирована');

    // Инициализация моковых данных
    console.log('[START] Шаг 2: Инициализация моковых данных...');
    await initializeMockData();
    console.log('[START] Шаг 2 завершен: Моковые данные инициализированы');

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
    console.error('[START] ========== КРИТИЧЕСКАЯ ОШИБКА ==========');
    console.error('[START] Ошибка:', error);
    console.error('[START] Stack:', error.stack);
    console.error('[START] Тип ошибки:', error.constructor.name);
    if (error.message) {
      console.error('[START] Сообщение:', error.message);
    }
    console.error('[START] =========================================');
    process.exit(1);
  }
}

startBot();

