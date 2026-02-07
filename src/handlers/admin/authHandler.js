import { config } from '../../config/index.js';
import { showAdminMenuKeyboard, getMenuKeyboard } from '../../utils/keyboardHelpers.js';

// Экспортируем adminSessions для использования в других модулях
export const adminSessions = new Map();

/**
 * Проверка прав администратора
 */
export function isAdmin(userId) {
    return adminSessions.has(userId);
}

/**
 * Регистрирует обработчики аутентификации
 * @param {Object} bot - Экземпляр Telegraf бота
 * @param {Map} adminSessions - Map с активными сессиями админов
 * @param {Function} showAdminPanel - Функция для показа админ-панели
 * @param {Function} showAdminMenuKeyboard - Функция для показа админского меню
 */
export function registerAuthHandlers(bot, adminSessions, showAdminPanel, showAdminMenuKeyboard) {
    // Команда для входа в админ-панель
    bot.command('apanel', async (ctx) => {
        console.log('[AdminHandlers] ========== ОБРАБОТЧИК /apanel ВЫЗВАН ==========');
        console.log('[AdminHandlers] ========== Команда /apanel получена ==========');
        console.log('[AdminHandlers] Пользователь ID:', ctx.from.id);
        console.log('[AdminHandlers] Текст команды:', ctx.message.text);

        try {
            const args = ctx.message.text.split(' ');
            const password = args[1];
            console.log('[AdminHandlers] Пароль получен:', password ? 'да' : 'нет');

            if (!password) {
                await ctx.reply('❌ Укажите пароль: /apanel пароль');
                return;
            }

            if (password === config.adminPassword) {
                console.log('[AdminHandlers] Пароль верный, вход в админ-панель');
                adminSessions.set(ctx.from.id, true);

                // Приветственное сообщение
                console.log('[AdminHandlers] Отправка приветственного сообщения...');
                await ctx.reply('✅ Вы вошли в администраторскую панель!', {
                    parse_mode: 'HTML'
                });
                console.log('[AdminHandlers] Приветственное сообщение отправлено');

                // Админские команды остаются доступными, но не отображаются в меню
                // Это позволяет использовать команды напрямую, но не засоряет меню
                console.log('[AdminHandlers] Админские команды доступны, но не отображаются в меню');

                // Показываем админские reply keyboard кнопки
                await showAdminMenuKeyboard(ctx);

                // Показываем админ-панель
                console.log('[AdminHandlers] Показ админ-панели...');
                await showAdminPanel(ctx);
                console.log('[AdminHandlers] Админ-панель показана');
            } else {
                console.log('[AdminHandlers] Неверный пароль');
                await ctx.reply('❌ Неверный пароль доступа к админ-панели.');
            }
        } catch (error) {
            console.error('[AdminHandlers] ========== КРИТИЧЕСКАЯ ОШИБКА в /apanel ==========');
            console.error('[AdminHandlers] Ошибка:', error);
            console.error('[AdminHandlers] Stack:', error.stack);
            try {
                await ctx.reply('❌ Произошла ошибка при входе в админ-панель. Попробуйте позже.');
            } catch (e) {
                console.error('[AdminHandlers] Не удалось отправить сообщение об ошибке:', e);
            }
        }
    });

    // Выход из админ-панели
    bot.hears('Выход из админ-панели', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await handleLogout(bot, ctx, adminSessions);
    });

    bot.action('admin_logout', async (ctx) => {
        await handleLogout(bot, ctx, adminSessions);
    });
}

/**
 * Обработка выхода из админ-панели
 */
async function handleLogout(bot, ctx, adminSessions) {
    adminSessions.delete(ctx.from.id);

    // Возвращаем обычное пользовательское меню команд
    try {
        const userCommands = [
            { command: 'start', description: 'Главное меню' },
            { command: 'catalog', description: 'Каталог товаров' },
            { command: 'cabinet', description: 'Личный кабинет' }
        ];

        await bot.telegram.setMyCommands(userCommands, {
            scope: {
                type: 'chat',
                chat_id: ctx.from.id
            }
        });
        console.log('[AdminHandlers] Пользовательское меню команд восстановлено для пользователя:', ctx.from.id);
    } catch (error) {
        console.error('[AdminHandlers] Ошибка при восстановлении пользовательского меню команд:', error);
    }

    if (ctx.callbackQuery) {
        await ctx.editMessageText('✅ Вы вышли из админ-панели. Пользовательское меню восстановлено.');
    } else {
        await ctx.reply('✅ Вы вышли из админ-панели. Пользовательское меню восстановлено.');
    }

    const keyboard = await getMenuKeyboard();
    await ctx.reply('Выберите действие:', {
        reply_markup: keyboard
    });
}
