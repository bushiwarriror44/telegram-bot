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

    bot.hears('Управление счетами (Карты)', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCardsAdmin(ctx);
    });

    bot.action('admin_card_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            'Введите данные нового карточного счета:\n\nФормат: <code>/addcard Название|Номер счета</code>\n\nПример: <code>/addcard Альфа-Банк|5536 9141 2345 6789</code>',
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
        const trimmedName = name.trim();
        const trimmedCardNumber = accountNumber.trim();

        try {
            // Проверяем, существует ли карточный счет с таким именем (включая отключенные)
            const existingAccount = await cardAccountService.getByName(trimmedName, true);

            if (existingAccount) {
                // Если счет существует, добавляем карту в массив
                await cardAccountService.addCard(existingAccount.id, trimmedCardNumber);
                await ctx.reply(`✅ Карта "${trimmedCardNumber}" успешно добавлена в счет "${trimmedName}"!`);
            } else {
                // Если счета нет, создаем новый счет с этой картой
                await cardAccountService.create(trimmedName, trimmedCardNumber);
                await ctx.reply(`✅ Карточный счет "${trimmedName}" успешно создан с картой "${trimmedCardNumber}"!`);
            }
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

    bot.action('admin_card_manage', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCardManageMenu(ctx);
    });

    bot.action(/^admin_card_manage_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cardId = parseInt(ctx.match[1]);
        await showCardDetails(ctx, cardId);
    });

    bot.action(/^admin_card_add_card_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cardId = parseInt(ctx.match[1]);
        cardAddMode.set(ctx.from.id, cardId);
        await ctx.editMessageText(
            '➕ <b>Добавление карты</b>\n\n' +
            'Введите номер новой карты.\n\n' +
            'Формат: <code>/addcardnum Номер карты</code>\n\n' +
            'Пример: <code>/addcardnum 5536 9141 2345 6789</code>\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action(/^admin_card_remove_card_(\d+)_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cardId = parseInt(ctx.match[1]);
        const cardIndex = parseInt(ctx.match[2]);

        try {
            await cardAccountService.removeCard(cardId, cardIndex);
            await ctx.editMessageText('✅ Карта успешно удалена!');
            await showCardDetails(ctx, cardId);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.command('addcardnum', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        if (!cardAddMode.has(ctx.from.id)) {
            await ctx.reply('❌ Сначала выберите карточный счет для добавления карты.');
            return;
        }

        const cardId = cardAddMode.get(ctx.from.id);
        const args = ctx.message.text.split(' ').slice(1).join(' ');

        if (!args || args.trim().length === 0) {
            await ctx.reply('❌ Укажите номер карты.\nФормат: /addcardnum Номер карты');
            return;
        }

        try {
            await cardAccountService.addCard(cardId, args.trim());
            cardAddMode.delete(ctx.from.id);
            await ctx.reply(`✅ Карта "${args.trim()}" успешно добавлена!`);
            await showCardDetails(ctx, cardId);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });
}

// Режим добавления карты
export const cardAddMode = new Map(); // userId -> cardId

/**
 * Показ меню управления карточными счетами
 */
export async function showCardsAdmin(ctx) {
    const cards = await cardAccountService.getAll(false);

    let cardsText = '';
    if (cards.length === 0) {
        cardsText = 'Карточных счетов пока нет';
    } else {
        for (const card of cards) {
            const randomCard = card.cards && card.cards.length > 0
                ? card.cards[Math.floor(Math.random() * card.cards.length)]
                : card.account_number;
            const cardsCount = card.cards ? card.cards.length : 1;
            cardsText += `• ${card.name}: <code>${randomCard}</code> (${cardsCount} карт${cardsCount > 1 ? 'ы' : 'а'}) ${card.enabled ? '✅' : '❌'}\n`;
        }
    }

    const text = `
💳 <b>Управление счетами (Карты)</b>

Текущие карточные счета:
${cardsText}

При оплате картой пользователям будет случайно показываться одна из карт активных счетов.
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [{ text: '➕ Добавить карточный счет', callback_data: 'admin_card_add' }],
            [{ text: '✏️ Управление картами', callback_data: 'admin_card_manage' }],
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

/**
 * Показ меню выбора карточного счета для управления картами
 */
export async function showCardManageMenu(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const cards = await cardAccountService.getAll(false);

    if (cards.length === 0) {
        await ctx.editMessageText('Нет карточных счетов для управления.');
        return;
    }

    const keyboard = cards.map(card => [
        { text: `💳 ${card.name} (${card.cards ? card.cards.length : 1} карт${card.cards && card.cards.length > 1 ? 'ы' : 'а'})`, callback_data: `admin_card_manage_${card.id}` }
    ]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_cards' }]);

    await ctx.editMessageText('Выберите карточный счет для управления картами:', {
        reply_markup: { inline_keyboard: keyboard }
    });
}

/**
 * Показ деталей карточного счета со списком карт
 */
export async function showCardDetails(ctx, cardId) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const card = await cardAccountService.getById(cardId);
    if (!card) {
        await ctx.editMessageText('Карточный счет не найден.');
        return;
    }

    const cards = card.cards || [card.account_number];
    let cardsList = '';
    if (cards.length === 0) {
        cardsList = 'Карт нет';
    } else {
        cards.forEach((cardNumber, index) => {
            cardsList += `${index + 1}. <code>${cardNumber}</code>\n`;
        });
    }

    const text = `
💳 <b>Управление картами: ${card.name}</b>

Список карт:
${cardsList}

Выберите действие:
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [{ text: '➕ Добавить карту', callback_data: `admin_card_add_card_${cardId}` }],
            ...cards.map((cardNumber, index) => [
                { text: `🗑️ Удалить карту ${index + 1}`, callback_data: `admin_card_remove_card_${cardId}_${index}` }
            ]),
            [{ text: '◀️ Назад', callback_data: 'admin_card_manage' }]
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
