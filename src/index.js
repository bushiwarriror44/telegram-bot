import { Telegraf } from 'telegraf';
import { config } from './config/index.js';
console.log('[INDEX] Конфиг загружен');

import { database } from './database/db.js';
console.log('[INDEX] Модуль database загружен');

import { setupUserHandlers, setAdminSessions } from './handlers/userHandlers.js';
import { setupAdminHandlers, adminSessions } from './handlers/adminHandlers.js';
console.log('[INDEX] Модули handlers загружены');

import { initializeMockData, ensureTransgranExists } from './utils/mockData.js';
import { menuButtonService } from './services/menuButtonService.js';
import { UnpaidOrderMonitorService } from './services/unpaidOrderMonitorService.js';
console.log('[INDEX] Все модули загружены');

// Хранилище запущенных ботов для graceful shutdown
const runningBots = [];

/**
 * Создает и запускает один экземпляр бота
 * @param {string} botToken - Токен бота
 * @param {number} botIndex - Индекс бота (для логирования)
 * @returns {Promise<Telegraf>} Экземпляр запущенного бота
 */
async function startSingleBot(botToken, botIndex) {
  try {
    console.log(`[BOT-${botIndex}] ========== Запуск бота #${botIndex} ==========`);
    console.log(`[BOT-${botIndex}] Время:`, new Date().toISOString());
    console.log(`[BOT-${botIndex}] Токен (первые 10 символов):`, botToken.substring(0, 10) + '...');

    // Проверка токена
    if (!botToken || botToken.trim() === '') {
      throw new Error(`BOT_TOKEN #${botIndex} пустой или не установлен!`);
    }

    // Создание экземпляра бота
    console.log(`[BOT-${botIndex}] Создание экземпляра бота...`);
    const bot = new Telegraf(botToken);
    console.log(`[BOT-${botIndex}] Экземпляр бота создан`);

    // Middleware для логирования (с указанием индекса бота)
    console.log(`[BOT-${botIndex}] Регистрация middleware для логирования обновлений...`);
    bot.use(async (ctx, next) => {
      console.log(`[BOT-${botIndex}] ========== ВХОДЯЩЕЕ ОБНОВЛЕНИЕ ==========`);
      console.log(`[BOT-${botIndex}] Update ID:`, ctx.update.update_id);
      console.log(`[BOT-${botIndex}] Тип обновления:`, ctx.update.message ? 'message' : ctx.update.callback_query ? 'callback_query' : 'other');
      if (ctx.update.message) {
        console.log(`[BOT-${botIndex}] Message ID:`, ctx.update.message.message_id);
        console.log(`[BOT-${botIndex}] Text:`, ctx.update.message.text);
        console.log(`[BOT-${botIndex}] From ID:`, ctx.update.message.from?.id);
        console.log(`[BOT-${botIndex}] From Username:`, ctx.update.message.from?.username);
        if (ctx.update.message.text?.startsWith('/')) {
          console.log(`[BOT-${botIndex}] Это команда:`, ctx.update.message.text);
        }
      }
      console.log(`[BOT-${botIndex}] ========================================`);
      return next();
    });
    console.log(`[BOT-${botIndex}] Middleware для логирования обновлений настроен`);

    // Обработка ошибок
    console.log(`[BOT-${botIndex}] Настройка обработчика ошибок...`);
    bot.catch((err, ctx) => {
      console.error(`[BOT-${botIndex}] ========== ОШИБКА В БОТЕ ==========`);
      console.error(`[BOT-${botIndex}] Ошибка:`, err);
      console.error(`[BOT-${botIndex}] Сообщение:`, err.message);
      console.error(`[BOT-${botIndex}] Stack:`, err.stack);
      console.error(`[BOT-${botIndex}] Context:`, ctx ? 'есть' : 'нет');
      if (ctx) {
        console.error(`[BOT-${botIndex}] Update ID:`, ctx.update?.update_id);
        console.error(`[BOT-${botIndex}] Message:`, ctx.message?.text);
      }
      if (ctx && ctx.reply) {
        ctx.reply('Произошла ошибка. Попробуйте позже.').catch(console.error);
      }
    });
    console.log(`[BOT-${botIndex}] Обработчик ошибок настроен`);

    // Проверка подключения к Telegram API и получение информации о боте (ДО настройки handlers, чтобы передать username)
    console.log(`[BOT-${botIndex}] Проверка подключения к Telegram API...`);
    let botUsername = null;
    try {
      const testResult = await bot.telegram.getMe();
      botUsername = testResult.username || null;
      console.log(`[BOT-${botIndex}] Подключение к Telegram API успешно!`);
      console.log(`[BOT-${botIndex}] Информация о боте:`, JSON.stringify(testResult));
      if (botUsername) {
        console.log(`[BOT-${botIndex}] Username бота: @${botUsername}`);
      }
    } catch (testError) {
      console.error(`[BOT-${botIndex}] ОШИБКА при проверке подключения к Telegram API!`);
      console.error(`[BOT-${botIndex}] Ошибка:`, testError.message);
      throw new Error(`Не удалось подключиться к Telegram API для бота #${botIndex}: ${testError.message}`);
    }

    // Настройка обработчиков
    console.log(`[BOT-${botIndex}] Настройка обработчиков...`);
    console.log(`[BOT-${botIndex}] Настройка админ-обработчиков...`);
    setupAdminHandlers(bot);
    console.log(`[BOT-${botIndex}] Админ-обработчики настроены`);
    
    // Передаем adminSessions в userHandlers для проверки админов
    setAdminSessions(adminSessions);
    console.log(`[BOT-${botIndex}] adminSessions переданы в userHandlers`);
    
    console.log(`[BOT-${botIndex}] Настройка пользовательских обработчиков...`);
    await setupUserHandlers(bot, botUsername);
    console.log(`[BOT-${botIndex}] Пользовательские обработчики настроены`);

    // Настройка меню команд для пользователей
    console.log(`[BOT-${botIndex}] Настройка меню команд...`);
    try {
      await bot.telegram.setMyCommands([
        { command: 'start', description: 'Главное меню' },
        { command: 'catalog', description: 'Каталог товаров' },
        { command: 'cabinet', description: 'Личный кабинет' }
      ]);
      console.log(`[BOT-${botIndex}] Меню команд успешно настроено`);
    } catch (commandsError) {
      console.error(`[BOT-${botIndex}] Ошибка при настройке меню команд:`, commandsError);
    }

    // Запуск бота
    console.log(`[BOT-${botIndex}] Запуск бота через bot.launch()...`);
    const launchPromise = bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'callback_query']
    });

    launchPromise.then(() => {
      console.log(`[BOT-${botIndex}] bot.launch() успешно завершен`);
    }).catch((err) => {
      console.error(`[BOT-${botIndex}] ОШИБКА в bot.launch():`, err);
      console.error(`[BOT-${botIndex}] Сообщение:`, err.message);
      console.error(`[BOT-${botIndex}] Stack:`, err.stack);
    });

    console.log(`[BOT-${botIndex}] ========== Бот #${botIndex} успешно запущен! ==========`);
    console.log(`[BOT-${botIndex}] Бот готов к работе`);
    console.log(`[BOT-${botIndex}] Бот подключен к Telegram API`);
    console.log(`[BOT-${botIndex}] Бот слушает обновления через polling...`);

    // Даем боту время на инициализацию polling
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`[BOT-${botIndex}] Бот полностью инициализирован и готов принимать команды`);

    return bot;
  } catch (error) {
    console.error(`[BOT-${botIndex}] ========== ОШИБКА при запуске бота #${botIndex}! ==========`);
    console.error(`[BOT-${botIndex}] Ошибка:`, error);
    console.error(`[BOT-${botIndex}] Сообщение:`, error.message);
    console.error(`[BOT-${botIndex}] Stack:`, error.stack);
    throw error;
  }
}

async function startBot() {
  try {
    console.log('[START] ========== Запуск системы ботов ==========');
    console.log('[START] Время:', new Date().toISOString());

    // Инициализация базы данных (общая для всех ботов)
    console.log('[START] Шаг 1: Инициализация общей базы данных...');
    await database.init();
    console.log('[START] Шаг 1 завершен: База данных инициализирована');

    // Инициализация моковых данных (один раз для всех ботов)
    console.log('[START] Шаг 2: Инициализация моковых данных...');
    await initializeMockData();
    console.log('[START] Шаг 2 завершен: Моковые данные инициализированы');
    
    // Гарантированное создание ТРАНСГРАН (один раз для всех ботов)
    console.log('[START] Шаг 2.1: Проверка и создание ТРАНСГРАН...');
    await ensureTransgranExists();
    console.log('[START] Шаг 2.1 завершен: ТРАНСГРАН проверен/создан');

    // Проверка токенов ботов
    console.log('[START] Шаг 3: Проверка токенов ботов...');
    console.log('[START] Количество токенов:', config.botTokens.length);
    
    if (config.botTokens.length === 0) {
      throw new Error('BOT_TOKEN не установлен в переменных окружения! Укажите токены через запятую: BOT_TOKEN=token1,token2,token3');
    }

    console.log('[START] Найдено токенов:', config.botTokens.length);
    config.botTokens.forEach((token, index) => {
      console.log(`[START] Токен #${index + 1} (первые 10 символов):`, token.substring(0, 10) + '...');
    });
    console.log('[START] Шаг 3 завершен: Токены проверены');

    // Запуск всех ботов
    console.log('[START] Шаг 4: Запуск ботов...');
    const botPromises = config.botTokens.map((token, index) => 
      startSingleBot(token, index + 1).catch(error => {
        console.error(`[START] Не удалось запустить бот #${index + 1}:`, error.message);
        return null; // Возвращаем null для неудачных запусков
      })
    );

    const bots = await Promise.all(botPromises);
    const successfulBots = bots.filter(bot => bot !== null);
    const failedCount = config.botTokens.length - successfulBots.length;

    if (successfulBots.length === 0) {
      throw new Error('Не удалось запустить ни одного бота! Проверьте токены в .env файле.');
    }

    console.log(`[START] Успешно запущено ботов: ${successfulBots.length} из ${config.botTokens.length}`);
    if (failedCount > 0) {
      console.warn(`[START] Не запустилось ботов: ${failedCount} (токен заблокирован/удалён или неверный — остальные боты работают)`);
    }
    
    // Сохраняем успешно запущенные боты для graceful shutdown
    runningBots.push(...successfulBots);

    // Запускаем фоновую проверку неоплаченных заказов (один раз для всех ботов)
    // Используем первый успешно запущенный бот для отправки уведомлений
    if (successfulBots.length > 0) {
      console.log('[START] Запуск фоновой проверки неоплаченных заказов...');
      const unpaidOrderMonitor = new UnpaidOrderMonitorService(successfulBots[0]);
      unpaidOrderMonitor.start();
      console.log('[START] Фоновая проверка неоплаченных заказов запущена');
    }

    console.log('[START] ========== Система ботов успешно запущена! ==========');
    console.log(`[START] Всего запущено ботов: ${successfulBots.length}`);
    console.log('[START] Все боты используют общую базу данных');
    console.log('[START] Все боты готовы к работе');
    console.log('[START] Попробуйте отправить /start любому из ботов в Telegram');

    // Graceful shutdown для всех ботов
    const shutdown = async (signal) => {
      console.log(`[START] Получен ${signal}, останавливаем всех ботов...`);
      const stopPromises = runningBots.map((bot, index) => {
        try {
          console.log(`[START] Остановка бота #${index + 1}...`);
          bot.stop(signal);
          console.log(`[START] Бот #${index + 1} остановлен`);
        } catch (error) {
          console.error(`[START] Ошибка при остановке бота #${index + 1}:`, error);
        }
      });
      await Promise.all(stopPromises);
      database.close();
      console.log('[START] Все боты остановлены, база данных закрыта');
      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

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

console.log('[INDEX] Вызов startBot()...');
startBot()
  .then(() => {
    console.log('[INDEX] startBot() завершился успешно (промис резолвлен)');
  })
  .catch((err) => {
    console.error('[INDEX] startBot() завершился с ошибкой:', err);
    console.error('[INDEX] Stack:', err?.stack);
    process.exit(1);
  });

