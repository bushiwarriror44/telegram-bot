import { cardAccountService } from '../../services/cardAccountService.js';
import { isAdmin } from './authHandler.js';

/**
 * Регистрирует обработчики управления карточными счетами
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerCardsHandlers(bot) {
    bot.action('admin_cards', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCardsAdmin(ctx);
    });

    bot.hears('Управление карточными счетами', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCardsAdmin(ctx);
    });

    bot.action('admin_card_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            'Введите данные нового карточного счета:\n\nФормат: <code>/addcard Название|Номер счета</code>\n\nПример: /addcard Альфа-Банк|5536 9141 2345 6789',
            { parse_mode: 'HTML' }
        );
    });

    bot.command('addcard', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1).join(' ').split('|');

        if (args.length < 2) {
            await ctx.reply('❌ Неверный формат.\nФормат: /addcard Название|Номер счета');
            return;
        }

        const [name, accountNumber] = args;

        try {
            await cardAccountService.create(name.trim(), accountNumber.trim());
            await ctx.reply(`✅ Карточный счет "${name}" успешно добавлен!`);
            await showCardsAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_card_delete', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cards = await cardAccountService.getAll(false);

        if (cards.length === 0) {
            await ctx.editMessageText('Нет карточных счетов для удаления.');
            return;
        }

        const keyboard = cards.map(card => [
            { text: `🗑️ ${card.name}`, callback_data: `admin_card_del_${card.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_cards' }]);

        await ctx.editMessageText('Выберите карточный счет для удаления:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_card_del_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cardId = parseInt(ctx.match[1]);

        try {
            await cardAccountService.delete(cardId);
            await ctx.editMessageText('✅ Карточный счет успешно удален!');
            await showCardsAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });
}

/**
 * Показ меню управления карточными счетами
 */
export async function showCardsAdmin(ctx) {
    const cards = await cardAccountService.getAll(false);

    const text = `
💳 <b>Управление карточными счетами</b>

Текущие карточные счета:
${cards.map(card => `• ${card.name}: <code>${card.account_number}</code> ${card.enabled ? '✅' : '❌'}`).join('\n') || 'Карточных счетов пока нет'}

При оплате картой пользователям будет случайно показываться один из активных счетов.
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [{ text: '➕ Добавить карточный счет', callback_data: 'admin_card_add' }],
            [{ text: '🗑️ Удалить карточный счет', callback_data: 'admin_card_delete' }],
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
