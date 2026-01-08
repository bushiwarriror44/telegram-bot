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

    // ВАЖНО: Middleware должен регистрироваться ДО обработчиков!
    // Логирование всех входящих обновлений для отладки
    console.log('[START] Регистрация middleware для логирования обновлений (ПЕРЕД обработчиками)...');
    bot.use(async (ctx, next) => {
      console.log('[BOT] ========== ВХОДЯЩЕЕ ОБНОВЛЕНИЕ ==========');
      console.log('[BOT] Update ID:', ctx.update.update_id);
      console.log('[BOT] Тип обновления:', ctx.update.message ? 'message' : ctx.update.callback_query ? 'callback_query' : 'other');
      if (ctx.update.message) {
        console.log('[BOT] Message ID:', ctx.update.message.message_id);
        console.log('[BOT] Text:', ctx.update.message.text);
        console.log('[BOT] From ID:', ctx.update.message.from?.id);
        console.log('[BOT] From Username:', ctx.update.message.from?.username);
        if (ctx.update.message.text?.startsWith('/')) {
          console.log('[BOT] Это команда:', ctx.update.message.text);
        }
      }
      console.log('[BOT] ========================================');
      return next();
    });
    console.log('[START] Middleware для логирования обновлений настроен');

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

    // Настройка обработчиков
    // ВАЖНО: Админ-обработчики регистрируем ПЕРВЫМИ, чтобы команды /apanel и другие админ-команды
    // обрабатывались до того, как bot.on('text') может их перехватить
    console.log('[START] Шаг 5: Настройка обработчиков...');
    console.log('[START] Настройка админ-обработчиков (ПЕРВЫМИ, чтобы команды /apanel обрабатывались)...');
    setupAdminHandlers(bot);
    console.log('[START] Админ-обработчики настроены');
    console.log('[START] Настройка пользовательских обработчиков...');
    setupUserHandlers(bot);
    console.log('[START] Пользовательские обработчики настроены');
    console.log('[START] Шаг 5 завершен: Обработчики настроены');

    // Настройка меню команд для пользователей
    console.log('[START] Настройка меню команд...');
    try {
      await bot.telegram.setMyCommands([
        { command: 'start', description: 'Главное меню' },
        { command: 'catalog', description: 'Каталог товаров' },
        { command: 'cabinet', description: 'Личный кабинет' }
      ]);
      console.log('[START] Меню команд успешно настроено');
    } catch (commandsError) {
      console.error('[START] Ошибка при настройке меню команд:', commandsError);
    }

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
      // Запускаем бота через bot.launch()
      console.log('[START] Запуск бота через bot.launch()...');

      // В Telegraf 4.x bot.launch() запускает polling и возвращает Promise
      // Но он может не резолвиться, поэтому запускаем его без await
      console.log('[START] Вызов bot.launch() без опций...');

      // Запускаем launch без await, чтобы не блокировать
      const launchPromise = bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query']
      });

      console.log('[START] bot.launch() вызван');

      // Обрабатываем Promise в фоне
      launchPromise.then(() => {
        console.log('[START] bot.launch() успешно завершен');
      }).catch((err) => {
        console.error('[START] ОШИБКА в bot.launch():', err);
        console.error('[START] Сообщение:', err.message);
        console.error('[START] Stack:', err.stack);
      });

      console.log('[START] ========== Бот успешно запущен! ==========');
      console.log('[START] Бот готов к работе');
      console.log('[START] Бот подключен к Telegram API');
      console.log('[START] Бот слушает обновления через polling...');
      console.log('[START] Ожидание обновлений от Telegram...');

      // Даем боту время на инициализацию polling
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('[START] Бот полностью инициализирован и готов принимать команды');
      console.log('[START] Попробуйте отправить /start боту в Telegram');
      console.log('[START] Если обновления не приходят, проверьте логи выше');
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

