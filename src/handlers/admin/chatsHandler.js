import { supportService } from '../../services/supportService.js';
import { isAdmin } from './authHandler.js';

// Хранит пользователей, которым администратор отвечает
export const adminReplyMode = new Map();

/**
 * Регистрирует обработчики управления чатами поддержки
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerChatsHandlers(bot) {
    bot.action('admin_chats', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showChatsMenu(ctx);
    });

    bot.hears('Чаты', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showChatsMenu(ctx);
    });

    bot.action('admin_chats_recent', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showChatsList(ctx, 10);
    });

    bot.action('admin_chats_all', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showChatsList(ctx);
    });

    bot.action(/^admin_chat_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const userChatId = parseInt(ctx.match[1]);
        await showConversation(ctx, userChatId);
    });

    bot.action(/^admin_reply_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const userChatId = parseInt(ctx.match[1]);
        adminReplyMode.set(ctx.from.id, userChatId);
        await ctx.editMessageText(
            `Введите ответ пользователю:\n\nФормат: <code>/reply Текст ответа</code>\n\nИли просто отправьте текст сообщения.`,
            { parse_mode: 'HTML' }
        );
    });
}

/**
 * Показ меню управления чатами
 */
export async function showChatsMenu(ctx) {
    const text = `
💬 <b>Чаты поддержки</b>

Выберите действие:
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [{ text: '📋 Последние', callback_data: 'admin_chats_recent' }],
            [{ text: '📚 Все чаты', callback_data: 'admin_chats_all' }],
            [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
        ]
    };

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        } catch (error) {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        }
    } else {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
    }
}

/**
 * Показ списка чатов
 */
export async function showChatsList(ctx, limit = null) {
    const users = await supportService.getUsersWithMessages(limit);

    if (users.length === 0) {
        await ctx.editMessageText('Нет сообщений от пользователей.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '◀️ Назад', callback_data: 'admin_chats' }]
                ]
            }
        });
        return;
    }

    const text = `
💬 <b>${limit ? 'Последние чаты' : 'Все чаты'}</b>

Выберите пользователя для просмотра переписки:
    `.trim();

    const keyboard = users.map(user => {
        const userName = user.first_name || user.username || `ID: ${user.chat_id}`;
        const unreadBadge = user.unread_count > 0 ? ` (${user.unread_count})` : '';
        return [{ text: `👤 ${userName}${unreadBadge}`, callback_data: `admin_chat_${user.chat_id}` }];
    });
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_chats' }]);

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
}

/**
 * Показ переписки с пользователем
 */
export async function showConversation(ctx, userChatId) {
    const user = await supportService.getUserInfo(userChatId);
    const messages = await supportService.getConversation(userChatId);

    if (!user) {
        await ctx.reply('Пользователь не найден.');
        return;
    }

    const userName = user.first_name || user.username || `ID: ${user.chat_id}`;
    let conversationText = `💬 <b>Переписка с ${userName}</b>\n\n`;

    if (messages.length === 0) {
        conversationText += 'Сообщений пока нет.';
    } else {
        for (const msg of messages) {
            const time = new Date(msg.created_at).toLocaleString('ru-RU');
            if (msg.is_from_admin) {
                conversationText += `👨‍💼 <b>Администратор</b> (${time}):\n${msg.message_text}\n\n`;
            } else {
                conversationText += `👤 <b>Пользователь</b> (${time}):\n${msg.message_text}\n\n`;
            }
        }
    }

    await ctx.editMessageText(conversationText, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '✍️ Ответить', callback_data: `admin_reply_${userChatId}` }],
                [{ text: '◀️ Назад к чатам', callback_data: 'admin_chats' }]
            ]
        }
    });
}
