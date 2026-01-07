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
      console.error('[BOT] ========== ОШИБКА В БОТЕ ==========');
      console.error('[BOT] Ошибка:', err);
      console.error('[BOT] Сообщение:', err.message);
      console.error('[BOT] Stack:', err.stack);
      console.error('[BOT] Context:', ctx ? 'есть' : 'нет');
      if (ctx) {
        console.error('[BOT] Update ID:', ctx.update?.update_id);
        console.error('[BOT] Message:', ctx.message?.text);
      }
      if (ctx && ctx.reply) {
        ctx.reply('Произошла ошибка. Попробуйте позже.');
      }
    });
    console.log('[START] Обработчик ошибок настроен');

    // Логирование всех входящих обновлений для отладки
    bot.use(async (ctx, next) => {
      console.log('[BOT] ========== ВХОДЯЩЕЕ ОБНОВЛЕНИЕ ==========');
      console.log('[BOT] Update ID:', ctx.update.update_id);
      console.log('[BOT] Тип обновления:', ctx.update.message ? 'message' : ctx.update.callback_query ? 'callback_query' : 'other');
      if (ctx.update.message) {
        console.log('[BOT] Message ID:', ctx.update.message.message_id);
        console.log('[BOT] Text:', ctx.update.message.text);
        console.log('[BOT] From ID:', ctx.update.message.from?.id);
        console.log('[BOT] From Username:', ctx.update.message.from?.username);
      }
      console.log('[BOT] ========================================');
      return next();
    });
    console.log('[START] Middleware для логирования обновлений настроен');

    // Запуск бота
    console.log('[START] Шаг 6: Запуск бота...');
    console.log('[START] Вызов bot.launch()...');
    console.log('[START] Токен (первые 10 символов):', config.botToken.substring(0, 10) + '...');

    // Проверяем подключение к Telegram API перед запуском
    console.log('[START] Проверка подключения к Telegram API...');
    try {
      const testResult = await bot.telegram.getMe();
      console.log('[START] Подключение к Telegram API успешно!');
      console.log('[START] Информация о боте:', JSON.stringify(testResult));
    } catch (testError) {
      console.error('[START] ОШИБКА при проверке подключения к Telegram API!');
      console.error('[START] Ошибка:', testError.message);
      console.error('[START] Stack:', testError.stack);
      throw new Error(`Не удалось подключиться к Telegram API: ${testError.message}`);
    }

    try {
      // Запускаем бота через bot.launch() с опциями
      console.log('[START] Запуск бота через bot.launch()...');

      const launchOptions = {
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query']
      };
      console.log('[START] Опции запуска:', JSON.stringify(launchOptions));

      // В Telegraf 4.x bot.launch() возвращает Promise, который резолвится после успешного запуска
      // Но он может зависать, поэтому используем startPolling как альтернативу
      console.log('[START] Использование bot.startPolling()...');
      bot.startPolling(launchOptions);

      console.log('[START] ========== Бот успешно запущен! ==========');
      console.log('[START] Бот готов к работе');
      console.log('[START] Бот подключен к Telegram API');
      console.log('[START] Бот слушает обновления через polling...');
      console.log('[START] Ожидание обновлений от Telegram...');

      // Даем боту немного времени на инициализацию
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('[START] Бот полностью инициализирован и готов принимать команды');
      console.log('[START] Попробуйте отправить /start боту в Telegram');
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

