import { userService } from '../../services/userService.js';
import { isAdmin } from './authHandler.js';

/**
 * Регистрирует обработчики управления уведомлениями
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerNotificationsHandlers(bot) {
    bot.action('admin_notification', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showNotificationMenu(ctx);
    });

    bot.hears('Создать уведомление', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showNotificationMenu(ctx);
    });

    bot.command('sendnotification', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ');
        const notificationText = args.slice(1).join(' ');

        if (!notificationText || notificationText.trim().length === 0) {
            await ctx.reply('❌ Укажите текст уведомления.\nФормат: /sendnotification Текст уведомления');
            return;
        }

        await sendNotificationToAll(bot, ctx, notificationText.trim());
    });
}

/**
 * Показ меню создания уведомления
 */
export async function showNotificationMenu(ctx) {
    const userCount = await userService.getUserCount();

    const text = `
📢 <b>Создание уведомления</b>

Всего пользователей в базе: <b>${userCount}</b>

Введите текст уведомления командой:
<code>/sendnotification Текст уведомления</code>

Или нажмите кнопку ниже для отмены.
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'admin_panel' }]
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
 * Функция рассылки уведомлений всем пользователям
 */
export async function sendNotificationToAll(bot, ctx, text) {
    const users = await userService.getAllUsers();
    const totalUsers = users.length;

    if (totalUsers === 0) {
        await ctx.reply('❌ В базе нет пользователей для рассылки.');
        return;
    }

    await ctx.reply(`📤 Начинаю рассылку уведомления ${totalUsers} пользователям...`);

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
        try {
            await bot.telegram.sendMessage(user.chat_id, `${text}`, {
                parse_mode: 'HTML'
            });
            successCount++;
        } catch (error) {
            failCount++;
            console.error(`Ошибка отправки уведомления пользователю ${user.chat_id}:`, error.message);
        }
    }

    await ctx.reply(
        `✅ Рассылка завершена!\n\n` +
        `✅ Успешно отправлено: ${successCount}\n` +
        `❌ Ошибок: ${failCount}\n` +
        `📊 Всего пользователей: ${totalUsers}`
    );
}
