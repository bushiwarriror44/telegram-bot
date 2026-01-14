import { packagingService } from '../../services/packagingService.js';
import { isAdmin } from './authHandler.js';
import { formatPackaging } from '../../utils/packagingHelper.js';

/**
 * Регистрирует обработчики управления фасовками
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerPackagingsHandlers(bot) {
    bot.action('admin_packagings', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPackagingsAdmin(ctx);
    });

    bot.hears('Управление фасовками', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPackagingsAdmin(ctx);
    });

    bot.action('admin_packaging_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            'Введите новую фасовку:\n\nФормат: <code>/addpack Значение</code>\n\nПример: /addpack 0.75',
            { parse_mode: 'HTML' }
        );
    });

    bot.command('addpack', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1);
        const valueStr = args[0];

        if (!valueStr) {
            await ctx.reply('❌ Укажите значение фасовки.\nПример: /addpack 0.35');
            return;
        }

        const value = parseFloat(valueStr.replace(',', '.'));
        if (isNaN(value) || value <= 0) {
            await ctx.reply('❌ Фасовка должна быть положительным числом.\nПример: /addpack 0.25');
            return;
        }

        try {
            const existing = await packagingService.getByValue(value);
            if (existing) {
                await ctx.reply('⚠️ Такая фасовка уже существует.');
                return;
            }

            await packagingService.create(value);
            await ctx.reply(`✅ Фасовка ${formatPackaging(value)} успешно добавлена!`);
            await showPackagingsAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });
}

/**
 * Показ меню управления фасовками
 */
export async function showPackagingsAdmin(ctx) {
    const packagings = await packagingService.getAll();

    const text = `
⚖️ <b>Управление фасовками</b>

Текущие фасовки:
${packagings.map((p) => `• ${formatPackaging(p.value)} (id: ${p.id})`).join('\n') || 'Фасовок пока нет'}
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [{ text: '➕ Добавить фасовку', callback_data: 'admin_packaging_add' }],
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
