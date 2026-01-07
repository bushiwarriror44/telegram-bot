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
    console.log('[START] Шаг 3: Проверка токена бота...');
    console.log('[START] Токен установлен?', !!config.botToken);
    console.log('[START] Длина токена:', config.botToken ? config.botToken.length : 0);
    if (!config.botToken) {
      throw new Error('BOT_TOKEN не установлен в переменных окружения!');
    }
    console.log('[START] Шаг 3 завершен: Токен проверен');

    // Создание экземпляра бота
    console.log('[START] Шаг 4: Создание экземпляра бота...');
    const bot = new Telegraf(config.botToken);
    console.log('[START] Шаг 4 завершен: Экземпляр бота создан');

    // Настройка обработчиков (сначала админ, чтобы его обработчики текста выполнялись первыми)
    console.log('[START] Шаг 5: Настройка обработчиков...');
    console.log('[START] Настройка админ-обработчиков...');
    setupAdminHandlers(bot);
    console.log('[START] Админ-обработчики настроены');
    console.log('[START] Настройка пользовательских обработчиков...');
    setupUserHandlers(bot);
    console.log('[START] Пользовательские обработчики настроены');
    console.log('[START] Шаг 5 завершен: Обработчики настроены');

    // Обработка ошибок
    console.log('[START] Настройка обработчика ошибок...');
    bot.catch((err, ctx) => {
      console.error('[BOT] Ошибка в боте:', err);
      if (ctx && ctx.reply) {
        ctx.reply('Произошла ошибка. Попробуйте позже.');
      }
    });
    console.log('[START] Обработчик ошибок настроен');

    // Запуск бота
    console.log('[START] Шаг 6: Запуск бота...');
    console.log('[START] Вызов bot.launch()...');
    console.log('[START] Токен (первые 10 символов):', config.botToken.substring(0, 10) + '...');
    try {
      // Запускаем бота с опциями
      const launchOptions = {
        dropPendingUpdates: true, // Игнорировать обновления, полученные до запуска
        allowedUpdates: ['message', 'callback_query'] // Только нужные типы обновлений
      };
      console.log('[START] Опции запуска:', JSON.stringify(launchOptions));

      const launchPromise = bot.launch(launchOptions);
      console.log('[START] bot.launch() вызван, ожидание...');

      // Добавляем таймаут для диагностики
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Таймаут при запуске бота (30 секунд)'));
        }, 30000);
      });

      await Promise.race([launchPromise, timeoutPromise]);
      console.log('[START] ========== Бот успешно запущен! ==========');
      console.log('[START] Бот готов к работе');
      console.log('[START] Бот подключен к Telegram API');
      console.log('[START] Бот слушает обновления...');
    } catch (launchError) {
      console.error('[START] ========== ОШИБКА при запуске бота! ==========');
      console.error('[START] Ошибка launch:', launchError);
      console.error('[START] Сообщение:', launchError.message);
      console.error('[START] Stack:', launchError.stack);
      console.error('[START] Тип ошибки:', launchError.constructor.name);
      if (launchError.response) {
        console.error('[START] Response:', launchError.response);
      }
      if (launchError.code) {
        console.error('[START] Код ошибки:', launchError.code);
      }
      console.error('[START] ============================================');
      throw launchError;
    }

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

