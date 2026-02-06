import { packagingService } from '../../services/packagingService.js';
import { isAdmin } from './authHandler.js';
import { formatPackaging } from '../../utils/packagingHelper.js';
import { getPackagingIcon } from '../../utils/packagingIconHelper.js';
import { packagingIconEditMode } from './textHandler.js';

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
            'Введите новую фасовку:\n\n' +
            'Форматы:\n' +
            '<code>/addpack Значение</code> — граммы (по умолчанию)\n' +
            '<code>/addpack Значение Единица</code> — с единицей измерения\n\n' +
            'Примеры:\n' +
            '/addpack 0.75\n' +
            '/addpack 1 л\n' +
            '/addpack 100 мл\n' +
            '/addpack 1 шт\n' +
            '/addpack 1 порция',
            { parse_mode: 'HTML' }
        );
    });

    // Добавление товара из предустановленного шаблона (через раздел фасовок)
    bot.action('admin_packaging_add_product', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.answerCbQuery();
        const { showPredefinedProductsForPlacement } = await import('./productsHandler.js');
        await showPredefinedProductsForPlacement(ctx);
    });

    bot.command('addpack', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1);
        const valueStr = args[0];
        const unitStr = args.slice(1).join(' ').trim();

        if (!valueStr) {
            await ctx.reply('❌ Укажите значение фасовки.\nПример: /addpack 0.35 или /addpack 1 л');
            return;
        }

        const value = parseFloat(valueStr.replace(',', '.'));
        if (isNaN(value) || value <= 0) {
            await ctx.reply('❌ Фасовка должна быть положительным числом.\nПример: /addpack 0.25');
            return;
        }

        const unit = unitStr || 'g';

        try {
            const existing = await packagingService.getOrCreate(value, unit);
            if (existing) {
                await ctx.reply('⚠️ Такая фасовка уже существует.');
                return;
            }

            await packagingService.create(value, unit);
            await ctx.reply(`✅ Фасовка ${formatPackaging(value, unit)} успешно добавлена!`);
            await showPackagingsAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    // Меню иконок фасовок
    bot.action('admin_packaging_icons', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const packagings = await packagingService.getAll();

        if (packagings.length === 0) {
            await ctx.answerCbQuery();
            await ctx.reply('Фасовок пока нет.');
            return;
        }

        const rows = [];
        for (const p of packagings) {
            const icon = await getPackagingIcon(p.id);
            const label = `${formatPackaging(p.value, p.unit)}${icon ? ' ' + icon : ''}`;
            rows.push([{
                text: label,
                callback_data: `admin_packaging_icon_${p.id}`
            }]);
        }
        rows.push([{ text: '◀️ Назад', callback_data: 'admin_packagings' }]);

        await ctx.editMessageText(
            '🏷️ <b>Иконки фасовок</b>\n\nВыберите фасовку для изменения иконки:',
            {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: rows }
            }
        );
    });

    // Выбор фасовки для редактирования иконки
    bot.action(/^admin_packaging_icon_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const packagingId = parseInt(ctx.match[1]);
        const packaging = await packagingService.getById(packagingId);
        if (!packaging) {
            await ctx.answerCbQuery('❌ Фасовка не найдена');
            return;
        }

        packagingIconEditMode.set(ctx.from.id, packagingId);
        const icon = await getPackagingIcon(packagingId);

        await ctx.answerCbQuery();
        await ctx.reply(
            `🏷️ <b>Изменение иконки фасовки</b>\n\n` +
            `Текущая фасовка: <b>${formatPackaging(packaging.value, packaging.unit)}</b>\n` +
            `Текущая иконка: ${icon || '—'}\n\n` +
            `Отправьте новую иконку (эмодзи или текст), например: 💎\n` +
            `Чтобы удалить иконку, отправьте '-' или пустое сообщение.`,
            { parse_mode: 'HTML' }
        );
    });
}

/**
 * Показ меню управления фасовками
 */
export async function showPackagingsAdmin(ctx) {
    const packagings = await packagingService.getAll();

    const lines = await Promise.all(
        packagings.map(async (p) => {
            const icon = await getPackagingIcon(p.id);
            const iconPart = icon ? ` ${icon}` : '';
            return `• ${formatPackaging(p.value, p.unit)}${iconPart} (id: ${p.id})`;
        })
    );

    const text = `
⚖️ <b>Управление фасовками</b>

Текущие фасовки:
${lines.join('\n') || 'Фасовок пока нет'}
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [{ text: '➕ Добавить фасовку', callback_data: 'admin_packaging_add' }],
            [{ text: '🏷️ Иконки фасовок', callback_data: 'admin_packaging_icons' }],
            [{ text: '➕ Добавить товар из шаблона', callback_data: 'admin_packaging_add_product' }],
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
