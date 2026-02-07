import { config } from '../config/index.js';
import { menuButtonService } from '../services/menuButtonService.js';
import { getAdminMenuKeyboard, getMenuKeyboard, showAdminMenuKeyboard } from '../utils/keyboardHelpers.js';
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

    // ВАЖНО: Сначала регистрируем bot.hears() для кнопок, чтобы они обрабатывались ДО bot.on('text')
    // Обработчики для админских reply keyboard кнопок (с иконками)
    bot.hears(['Города', '📕 Города'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showCitiesAdmin } = await import('./admin/citiesHandler.js');
        await showCitiesAdmin(ctx);
    });

    bot.hears(['Прив. сообщение'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showWelcomeSettings } = await import('./admin/settingsHandler.js');
        await showWelcomeSettings(ctx);
    });

    bot.hears(['Районы', '📗 Районы'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showDistrictsAdmin } = await import('./admin/citiesHandler.js');
        await showDistrictsAdmin(ctx);
    });

    bot.hears(['Товар', '📦 Товар'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showProductsAdmin } = await import('./admin/productsHandler.js');
        await showProductsAdmin(ctx);
    });

    bot.hears(['Фасовки', '🏷️ Фасовки'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showPackagingsAdmin } = await import('./admin/packagingsHandler.js');
        await showPackagingsAdmin(ctx);
    });

    bot.hears(['Пользователи', '👥 Пользователи'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showUsersAdmin } = await import('./admin/usersHandler.js');
        await showUsersAdmin(ctx);
    });

    bot.hears(['Рассылка', '✉️ Рассылка'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showNotificationMenu } = await import('./admin/notificationsHandler.js');
        await showNotificationMenu(ctx);
    });

    bot.hears(['Валюта', '💱 Валюта'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showCurrencySettings } = await import('./admin/settingsHandler.js');
        await showCurrencySettings(ctx);
    });

    bot.hears(['Крипто адреса', '💳 Крипто адреса'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showPaymentsAdmin } = await import('./admin/paymentsHandler.js');
        await showPaymentsAdmin(ctx);
    });

    bot.hears(['Кнопки', '🔲 Кнопки'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showMenuButtonsAdmin } = await import('./admin/menuButtonsHandler.js');
        await showMenuButtonsAdmin(ctx);
    });

    bot.hears(['Карточные адреса', '💳 Карточные адреса'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showCardsAdmin } = await import('./admin/cardsHandler.js');
        await showCardsAdmin(ctx);
    });

    bot.hears(['Настройки', '⚙️ Настройки'], async (ctx) => {
        const { isAdmin } = await import('./admin/authHandler.js');
        if (!isAdmin(ctx.from.id)) return;
        const { showSettingsMenu } = await import('./admin/settingsHandler.js');
        await showSettingsMenu(ctx);
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

        const keyboard = await getMenuKeyboard();
        await ctx.reply('Выберите действие:', {
            reply_markup: keyboard
        });
    });

    // Теперь регистрируем все остальные обработчики из модулей
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
    registerTextHandlers(bot); // bot.on('text') регистрируется ПОСЛЕДНИМ, чтобы не перехватывать bot.hears()
    registerMediaHandlers(bot);
    registerUsersHandlers(bot);

    console.log('[AdminHandlers] Админ-обработчики успешно настроены');
    console.log('[AdminHandlers] Зарегистрированы команды: /apanel и другие админ-команды');
}
