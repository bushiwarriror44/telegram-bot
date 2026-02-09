import { userService } from '../services/userService.js';
import { showMenuKeyboard } from '../utils/keyboardHelpers.js';

// Импортируем adminSessions для проверки, является ли пользователь админом
let adminSessions = null;

// Функция для установки adminSessions (вызывается из adminHandlers)
export function setAdminSessions(sessions) {
    adminSessions = sessions;
}

// Функция для проверки, является ли пользователь админом
function isAdmin(userId) {
    return adminSessions && adminSessions.has(userId);
}

// Экспортируем isAdmin для использования в keyboardHelpers
export function getIsAdminFunction() {
    return isAdmin;
}

// Map для хранения соответствия между bot.telegram и NotificationService
// Ключ: bot.telegram (экземпляр Telegram API)
// Значение: NotificationService
const botNotificationServiceMap = new Map();

/**
 * Получает NotificationService для данного контекста
 * @param {Object} ctx - Контекст Telegraf
 * @returns {Object|null} - NotificationService или null
 */
export function getNotificationServiceFromContext(ctx) {
    if (!ctx || !ctx.telegram) {
        console.warn('[UserHandlers] getNotificationServiceFromContext: ctx или ctx.telegram отсутствует');
        return null;
    }
    
    const notificationService = botNotificationServiceMap.get(ctx.telegram);
    if (!notificationService) {
        console.warn('[UserHandlers] getNotificationServiceFromContext: NotificationService не найден для ctx.telegram');
        console.log('[UserHandlers] getNotificationServiceFromContext: Доступные ключи в Map:', botNotificationServiceMap.size);
    }
    
    return notificationService || null;
}

export async function setupUserHandlers(bot, botUsername = null) {
    console.log('[UserHandlers] Настройка пользовательских обработчиков...');

    // Middleware для проверки блокировки пользователя
    bot.use(async (ctx, next) => {
        // Пропускаем админов (проверяем только если функция isAdmin доступна)
        if (isAdmin && ctx.from?.id && isAdmin(ctx.from.id)) {
            return next();
        }

        // Проверяем блокировку
        if (ctx.from?.id) {
            try {
                const blocked = await userService.isBlocked(ctx.from.id);
                if (blocked) {
                    await ctx.reply('🚫 Вы заблокированы в этом боте');
                    return; // Не продолжаем обработку
                }
            } catch (error) {
                // Если ошибка при проверке, пропускаем (чтобы не блокировать работу бота)
                console.error('[UserHandlers] Ошибка при проверке блокировки:', error);
            }
        }

        return next();
    });

    // Инициализируем notificationService для этого конкретного бота и сохраняем в объекте bot
    // Делаем это СИНХРОННО перед регистрацией обработчиков, чтобы notificationService был доступен сразу
    try {
        console.log(`[UserHandlers] Инициализация NotificationService для бота @${botUsername || 'unknown'}`);
        console.log(`[UserHandlers] Bot instance exists:`, !!bot);
        console.log(`[UserHandlers] Bot username:`, botUsername);
        
        const { NotificationService } = await import('../services/notificationService.js');
        console.log(`[UserHandlers] NotificationService класс импортирован`);
        
        const notificationService = new NotificationService(bot, botUsername);
        console.log(`[UserHandlers] NotificationService экземпляр создан`);
        
        // Сохраняем notificationService в объекте bot, чтобы каждый бот имел свой экземпляр
        bot.notificationService = notificationService;
        
        // Также сохраняем в Map для доступа через ctx.telegram
        botNotificationServiceMap.set(bot.telegram, notificationService);
        console.log(`[UserHandlers] ✅ NotificationService сохранен в bot.notificationService и в Map`);
        console.log(`[UserHandlers] Проверка: bot.notificationService exists:`, !!bot.notificationService);
        console.log(`[UserHandlers] Проверка: Map содержит bot.telegram:`, botNotificationServiceMap.has(bot.telegram));
        console.log(`[UserHandlers] NotificationService создан для бота @${botUsername || 'unknown'}`);
    } catch (error) {
        console.error(`[UserHandlers] ❌ Ошибка при создании NotificationService для бота @${botUsername || 'unknown'}:`, error);
        console.error(`[UserHandlers] Stack trace:`, error.stack);
        // Продолжаем работу даже если NotificationService не создан
    }

    // Регистрируем все обработчики из модулей (после инициализации NotificationService)
    await (async () => {
        // Команды
        const { registerCommands } = await import('./user/commandsHandler.js');
        await registerCommands(bot, isAdmin);

        // Каталог
        const { registerCatalogHandlers } = await import('./user/catalogHandler.js');
        registerCatalogHandlers(bot);

        // Кабинет
        const { registerCabinetHandlers } = await import('./user/cabinetHandler.js');
        registerCabinetHandlers(bot);

        // Пополнение
        const { registerTopupHandlers } = await import('./user/topupHandler.js');
        registerTopupHandlers(bot);

        // Отзывы
        const { registerReviewsHandlers } = await import('./user/reviewsHandler.js');
        registerReviewsHandlers(bot);

        // Поддержка
        const { registerSupportHandlers } = await import('./user/supportHandler.js');
        registerSupportHandlers(bot);

        // Навигация
        const { registerNavigationHandlers } = await import('./user/navigationHandler.js');
        registerNavigationHandlers(bot);

        // Текстовые сообщения
        const { registerTextHandlers } = await import('./user/textHandler.js');
        registerTextHandlers(bot);
    })();

    console.log('[UserHandlers] Все обработчики зарегистрированы');
    console.log('[UserHandlers] Финальная проверка: bot.notificationService exists:', !!bot.notificationService);
}
