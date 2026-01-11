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

let notificationService = null;

export function setupUserHandlers(bot) {
    console.log('[UserHandlers] Настройка пользовательских обработчиков...');

    // Инициализируем notificationService с bot
    (async () => {
        const { NotificationService } = await import('../services/notificationService.js');
        notificationService = new NotificationService(bot);

        // Устанавливаем notificationService в модули, которые его используют
        const { setNotificationService: setCatalogNotification } = await import('./user/catalogHandler.js');
        const { setNotificationService: setTopupNotification } = await import('./user/topupHandler.js');
        setCatalogNotification(notificationService);
        setTopupNotification(notificationService);
    })();

    // Регистрируем все обработчики из модулей
    (async () => {
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
}
