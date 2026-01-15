import { userService } from '../../services/userService.js';
import { isAdmin } from './authHandler.js';

// Хранит режим отправки сообщения пользователю (adminId -> userChatId)
export const adminMessageUserMode = new Map();

/**
 * Регистрирует обработчики управления пользователями
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerUsersHandlers(bot) {
    bot.action('admin_users', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showUsersAdmin(ctx);
    });

    bot.hears('Пользователи', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showUsersAdmin(ctx);
    });

    bot.action('admin_user_block', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showBlockUserMenu(ctx);
    });

    bot.action('admin_user_unblock', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showUnblockUserMenu(ctx);
    });

    bot.action(/^admin_user_block_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const userChatId = parseInt(ctx.match[1]);
        await blockUser(ctx, userChatId);
    });

    bot.action(/^admin_user_unblock_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const userChatId = parseInt(ctx.match[1]);
        await unblockUser(ctx, userChatId);
    });

    bot.action('admin_users_list', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showUsersList(ctx);
    });

    bot.action('admin_user_message', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showMessageUserMenu(ctx);
    });

    bot.action(/^admin_message_user_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const userChatId = parseInt(ctx.match[1]);
        await selectUserForMessage(ctx, userChatId);
    });
}

/**
 * Показ меню управления пользователями
 */
export async function showUsersAdmin(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const users = await userService.getAllUsersWithInfo();
    const totalUsers = users.length;
    const blockedUsers = users.filter(u => u.blocked === 1).length;
    const activeUsers = totalUsers - blockedUsers;

    const text = `
👥 <b>Управление пользователями</b>

📊 <b>Статистика:</b>
• Всего пользователей: <b>${totalUsers}</b>
• Активных: <b>${activeUsers}</b>
• Заблокированных: <b>${blockedUsers}</b>

Выберите действие:
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [{ text: '📋 Список всех пользователей', callback_data: 'admin_users_list' }],
            [{ text: '✉️ Написать пользователю', callback_data: 'admin_user_message' }],
            [{ text: '🚫 Заблокировать пользователя', callback_data: 'admin_user_block' }],
            [{ text: '✅ Разблокировать пользователя', callback_data: 'admin_user_unblock' }],
            [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
        ]
    };

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    } else {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    }
}

/**
 * Показ списка всех пользователей
 */
export async function showUsersList(ctx) {
    if (!isAdmin(ctx.from.id)) return;

    const users = await userService.getAllUsersWithInfo();

    if (users.length === 0) {
        await ctx.editMessageText('Нет зарегистрированных пользователей.');
        return;
    }

    // Показываем первые 50 пользователей
    const usersList = users.slice(0, 50);
    let text = `📋 <b>Список пользователей (${users.length})</b>\n\n`;

    usersList.forEach((user, index) => {
        const userName = user.first_name || user.username || `ID: ${user.chat_id}`;
        const status = user.blocked === 1 ? '🚫 Заблокирован' : '✅ Активен';
        const lastActive = user.last_active
            ? new Date(user.last_active).toLocaleDateString('ru-RU')
            : 'Никогда';
        text += `${index + 1}. ${userName} (${user.chat_id}) - ${status}\n`;
        text += `   Последняя активность: ${lastActive}\n\n`;
    });

    if (users.length > 50) {
        text += `\n<i>Показано 50 из ${users.length} пользователей</i>`;
    }

    const keyboard = {
        inline_keyboard: [
            [{ text: '◀️ Назад', callback_data: 'admin_users' }]
        ]
    };

    try {
        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    } catch (error) {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    }
}

/**
 * Показ меню блокировки пользователя
 */
export async function showBlockUserMenu(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const users = await userService.getAllUsersWithInfo();
    const activeUsers = users.filter(u => u.blocked !== 1);

    if (activeUsers.length === 0) {
        await ctx.editMessageText('Нет активных пользователей для блокировки.');
        return;
    }

    // Показываем первые 50 активных пользователей
    const usersList = activeUsers.slice(0, 50);
    const keyboard = usersList.map(user => {
        const userName = user.first_name || user.username || `ID: ${user.chat_id}`;
        return [{ text: `🚫 ${userName} (${user.chat_id})`, callback_data: `admin_user_block_${user.chat_id}` }];
    });
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_users' }]);

    const text = `🚫 <b>Заблокировать пользователя</b>\n\n` +
        `Выберите пользователя для блокировки:\n` +
        `(Показано ${usersList.length} из ${activeUsers.length} активных пользователей)`;

    try {
        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

/**
 * Показ меню разблокировки пользователя
 */
export async function showUnblockUserMenu(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const users = await userService.getAllUsersWithInfo();
    const blockedUsers = users.filter(u => u.blocked === 1);

    if (blockedUsers.length === 0) {
        await ctx.editMessageText('Нет заблокированных пользователей.');
        return;
    }

    // Показываем первые 50 заблокированных пользователей
    const usersList = blockedUsers.slice(0, 50);
    const keyboard = usersList.map(user => {
        const userName = user.first_name || user.username || `ID: ${user.chat_id}`;
        return [{ text: `✅ ${userName} (${user.chat_id})`, callback_data: `admin_user_unblock_${user.chat_id}` }];
    });
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_users' }]);

    const text = `✅ <b>Разблокировать пользователя</b>\n\n` +
        `Выберите пользователя для разблокировки:\n` +
        `(Показано ${usersList.length} из ${blockedUsers.length} заблокированных пользователей)`;

    try {
        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

/**
 * Блокировка пользователя
 */
export async function blockUser(ctx, userChatId) {
    try {
        await userService.blockUser(userChatId);
        await ctx.editMessageText(`✅ Пользователь ${userChatId} успешно заблокирован!`);
        await showUsersAdmin(ctx);
    } catch (error) {
        await ctx.editMessageText(`❌ Ошибка при блокировке пользователя: ${error.message}`);
    }
}

/**
 * Разблокировка пользователя
 */
export async function unblockUser(ctx, userChatId) {
    try {
        await userService.unblockUser(userChatId);
        await ctx.editMessageText(`✅ Пользователь ${userChatId} успешно разблокирован!`);
        await showUsersAdmin(ctx);
    } catch (error) {
        await ctx.editMessageText(`❌ Ошибка при разблокировке пользователя: ${error.message}`);
    }
}

/**
 * Показ меню выбора пользователя для отправки сообщения
 */
export async function showMessageUserMenu(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const users = await userService.getAllUsersWithInfo();

    if (users.length === 0) {
        await ctx.editMessageText('Нет зарегистрированных пользователей.');
        return;
    }

    // Показываем первые 50 пользователей
    const usersList = users.slice(0, 50);
    const keyboard = usersList.map(user => {
        const userName = user.first_name || user.username || `ID: ${user.chat_id}`;
        const status = user.blocked === 1 ? '🚫' : '✅';
        return [{ text: `${status} ${userName} (${user.chat_id})`, callback_data: `admin_message_user_${user.chat_id}` }];
    });
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_users' }]);

    const text = `✉️ <b>Написать пользователю</b>\n\n` +
        `Выберите пользователя для отправки сообщения:\n` +
        `(Показано ${usersList.length} из ${users.length} пользователей)`;

    try {
        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

/**
 * Выбор пользователя для отправки сообщения
 */
export async function selectUserForMessage(ctx, userChatId) {
    if (!isAdmin(ctx.from.id)) return;

    const user = await userService.getByChatId(userChatId);
    if (!user) {
        await ctx.answerCbQuery('Пользователь не найден');
        return;
    }

    // Устанавливаем режим отправки сообщения
    adminMessageUserMode.set(ctx.from.id, userChatId);

    const userName = user.first_name || user.username || `ID: ${userChatId}`;
    const status = user.blocked === 1 ? '🚫 Заблокирован' : '✅ Активен';

    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `✉️ <b>Написать пользователю</b>\n\n` +
        `Пользователь: <b>${userName}</b> (${userChatId})\n` +
        `Статус: ${status}\n\n` +
        `Введите сообщение для отправки пользователю:\n\n` +
        `Или отправьте /cancel для отмены.`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '◀️ Назад', callback_data: 'admin_user_message' }]
                ]
            }
        }
    );
}
