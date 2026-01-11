import { userService } from '../../services/userService.js';
import { supportService } from '../../services/supportService.js';

// Хранит пользователей, которые находятся в режиме поддержки
export const supportMode = new Map();

/**
 * Регистрирует обработчики поддержки
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerSupportHandlers(bot) {
    // Обработка кнопки "Помощь"
    bot.action('help_support', async (ctx) => {
        await showHelpMenu(ctx);
    });
}

/**
 * Показ меню помощи
 */
export async function showHelpMenu(ctx) {
    await userService.saveOrUpdate(ctx.from.id, {
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
    });

    const text = `
💬 <b>Служба поддержки</b>

Напишите нам обращение, и мы свяжемся с вами как можно быстрее.

Просто отправьте ваше сообщение текстом, и оно будет передано администратору.
    `.trim();

    // Устанавливаем пользователя в режим поддержки
    supportMode.set(ctx.from.id, true);

    await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '◀️ Назад', callback_data: 'back_to_cities' }]
            ]
        }
    });
}
