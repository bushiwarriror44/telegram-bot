import { config } from '../config/index.js';
import { menuButtonService } from '../services/menuButtonService.js';
import { getAdminMenuKeyboard, showAdminMenuKeyboard } from '../utils/keyboardHelpers.js';
import { showAdminPanel } from './admin/panelHandler.js';

// Импортируем обработчики из модулей
import { registerAuthHandlers } from './admin/authHandler.js';
import { registerPanelHandlers } from './admin/panelHandler.js';
import { registerCitiesHandlers } from './admin/citiesHandler.js';
import { registerProductsHandlers } from './admin/productsHandler.js';
import { registerPaymentsHandlers } from './admin/paymentsHandler.js';
import { registerCardsHandlers } from './admin/cardsHandler.js';
import { registerPackagingsHandlers } from './admin/packagingsHandler.js';
import { registerChatsHandlers } from './admin/chatsHandler.js';
import { registerNotificationsHandlers } from './admin/notificationsHandler.js';
import { registerDataHandlers } from './admin/dataHandler.js';
import { registerSettingsHandlers } from './admin/settingsHandler.js';
import { registerPromocodesHandlers } from './admin/promocodesHandler.js';
import { registerReviewsHandlers } from './admin/reviewsHandler.js';
import { registerStatisticsHandlers } from './admin/statisticsHandler.js';
import { registerMenuButtonsHandlers } from './admin/menuButtonsHandler.js';
import { registerTextHandlers } from './admin/textHandler.js';
import { registerMediaHandlers } from './admin/mediaHandler.js';
import { registerUsersHandlers } from './admin/usersHandler.js';

// Импортируем adminSessions из authHandler
import { adminSessions } from './admin/authHandler.js';

// Экспортируем adminSessions для использования в userHandlers
export { adminSessions };

export function setupAdminHandlers(bot) {
    console.log('[AdminHandlers] Настройка админ-обработчиков...');
    console.log('[AdminHandlers] Регистрация команды /apanel...');

    // Регистрируем все обработчики из модулей
    registerAuthHandlers(bot, adminSessions, showAdminPanel, showAdminMenuKeyboard);
    registerPanelHandlers(bot);
    registerCitiesHandlers(bot);
    registerProductsHandlers(bot);
    registerPaymentsHandlers(bot);
    registerCardsHandlers(bot);
    registerPackagingsHandlers(bot);
    registerChatsHandlers(bot);
    registerNotificationsHandlers(bot);
    registerDataHandlers(bot);
    registerSettingsHandlers(bot);
    registerPromocodesHandlers(bot);
    registerReviewsHandlers(bot);
    registerStatisticsHandlers(bot);
    registerMenuButtonsHandlers(bot);
    registerTextHandlers(bot);
    registerMediaHandlers(bot);
    registerUsersHandlers(bot);

    // Обработчики для админских reply keyboard кнопок
    bot.hears('Управление городами', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showCitiesAdmin } = await import('./admin/citiesHandler.js');
        await showCitiesAdmin(ctx);
    });

    bot.hears('Управление товарами', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showProductsAdmin } = await import('./admin/productsHandler.js');
        await showProductsAdmin(ctx);
    });

    bot.hears('Управление фасовками', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showPackagingsAdmin } = await import('./admin/packagingsHandler.js');
        await showPackagingsAdmin(ctx);
    });

    bot.hears('Управление методами оплаты', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showPaymentsAdmin } = await import('./admin/paymentsHandler.js');
        await showPaymentsAdmin(ctx);
    });

    bot.hears('Управление карточными счетами', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showCardsAdmin } = await import('./admin/cardsHandler.js');
        await showCardsAdmin(ctx);
    });

    bot.hears('Чаты', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showChatsMenu } = await import('./admin/chatsHandler.js');
        await showChatsMenu(ctx);
    });

    bot.hears('Создать уведомление', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showNotificationMenu } = await import('./admin/notificationsHandler.js');
        await showNotificationMenu(ctx);
    });

    bot.hears('Данные', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showDataMenu } = await import('./admin/dataHandler.js');
        await showDataMenu(ctx);
    });

    bot.hears('Статистика', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showStatisticsAdmin } = await import('./admin/statisticsHandler.js');
        await showStatisticsAdmin(ctx);
    });

    bot.hears('Настройка приветственного сообщения', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showWelcomeSettings } = await import('./admin/settingsHandler.js');
        await showWelcomeSettings(ctx);
    });

    bot.hears('Настройка кнопок', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showMenuButtonsAdmin } = await import('./admin/menuButtonsHandler.js');
        await showMenuButtonsAdmin(ctx);
    });

    bot.hears('Настройка иконок', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showIconsSettings } = await import('./admin/settingsHandler.js');
        await showIconsSettings(ctx);
    });

    bot.hears('Бонусы и промокоды', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showPromocodesAdmin } = await import('./admin/promocodesHandler.js');
        await showPromocodesAdmin(ctx);
    });

    bot.hears('Настройка реферальной системы', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showReferralSettings } = await import('./admin/settingsHandler.js');
        await showReferralSettings(ctx);
    });

    bot.hears('Пользователи', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showUsersAdmin } = await import('./admin/usersHandler.js');
        await showUsersAdmin(ctx);
    });

    bot.hears('Выход из админ-панели', async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        adminSessions.delete(ctx.from.id);

        // Возвращаем обычное пользовательское меню команд
        try {
            const userCommands = [
                { command: 'start', description: 'Главное меню' },
                { command: 'catalog', description: 'Каталог товаров' },
                { command: 'cabinet', description: 'Личный кабинет' }
            ];

            // Устанавливаем пользовательские команды для этого пользователя
            await bot.telegram.setMyCommands(userCommands, {
                scope: {
                    type: 'chat',
                    chat_id: ctx.from.id
                }
            });
            console.log('[AdminHandlers] Пользовательское меню команд восстановлено для пользователя:', ctx.from.id);
        } catch (error) {
            console.error('[AdminHandlers] Ошибка при восстановлении пользовательского меню команд:', error);
            console.error('[AdminHandlers] Детали ошибки:', error.message);
        }

        await ctx.reply('✅ Вы вышли из админ-панели. Пользовательское меню восстановлено.');

        // Показываем пользовательские reply keyboard кнопки
        const topButtons = [
            ['♻️ Каталог', '⚙️ Мой кабинет'],
            ['📨 Отзывы']
        ];
        const menuButtons = await menuButtonService.getAll(true);
        const dynamicButtons = menuButtons.map(btn => [btn.name]);
        const keyboard = [...topButtons, ...dynamicButtons];

        await ctx.reply('Выберите действие:', {
            reply_markup: {
                keyboard: keyboard,
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    });

    console.log('[AdminHandlers] Админ-обработчики успешно настроены');
    console.log('[AdminHandlers] Зарегистрированы команды: /apanel и другие админ-команды');
}
