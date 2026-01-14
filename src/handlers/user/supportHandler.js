import { userService } from '../../services/userService.js';
import { supportService } from '../../services/supportService.js';

// Хранит пользователей, которые находятся в режиме поддержки
// Формат: userId -> 'question' | 'problem' | 'payment_problem'
export const supportMode = new Map();

/**
 * Регистрирует обработчики поддержки
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerSupportHandlers(bot) {
    // Обработка кнопки "Помощь" (через callback, если используется inline кнопка)
    bot.action('help_support', async (ctx) => {
        await showHelpMenu(ctx);
    });
}

/**
 * Показ меню поддержки с выбором типа обращения
 */
export async function showHelpMenu(ctx) {
    await userService.saveOrUpdate(ctx.from.id, {
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
    });

    const text = `
💬 <b>Служба поддержки</b>

Выберите тип обращения:
    `.trim();

    // Используем reply keyboard вместо inline keyboard
    await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                ['💬 Вопрос'],
                ['🚨 Проблема'],
                ['❗ У меня проблема с платежом'],
                ['◀️ Назад']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
}

/**
 * Показ поля ввода для обращения в поддержку
 * @param {Object} ctx - Контекст Telegraf
 * @param {string} type - Тип обращения: 'question', 'problem', 'payment_problem'
 */
export async function showSupportInput(ctx, type) {
    const typeNames = {
        'question': 'Вопрос',
        'problem': 'Проблема',
        'payment_problem': 'Проблема с платежом'
    };

    const typeEmojis = {
        'question': '💬',
        'problem': '🚨',
        'payment_problem': '❗'
    };

    // Устанавливаем пользователя в режим поддержки с указанием типа
    supportMode.set(ctx.from.id, type);

    const text = `
${typeEmojis[type]} <b>${typeNames[type]}</b>

Введите ваше сообщение и наша команда постарается как можно быстрее вам помочь.
    `.trim();

    // Используем reply keyboard с кнопкой "Назад"
    await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                ['◀️ Назад']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
}
