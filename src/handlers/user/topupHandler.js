import { paymentService } from '../../services/paymentService.js';
import { cardAccountService } from '../../services/cardAccountService.js';
import { userService } from '../../services/userService.js';
import { cryptoExchangeService } from '../../services/cryptoExchangeService.js';
import { getCurrencySymbol } from '../../utils/currencyHelper.js';
import { generateTXID, generateTopupRequestText } from '../../utils/textFormatters.js';
import { settingsService } from '../../services/settingsService.js';
import { getMenuKeyboard } from '../../utils/keyboardHelpers.js';
import { getNotificationServiceFromContext } from '../userHandlers.js';

// Хранит пользователей, которые вводят сумму пополнения (userId -> methodId)
export const topupAmountMode = new Map();

/**
 * Получает notificationService из контекста
 * @param {Object} ctx - Контекст Telegraf
 * @returns {Object|null} - Экземпляр NotificationService или null
 */
function getNotificationService(ctx) {
    console.log('[TopupHandler] getNotificationService: Проверка ctx');
    console.log('[TopupHandler] getNotificationService: ctx exists:', !!ctx);
    console.log('[TopupHandler] getNotificationService: ctx.telegram exists:', !!ctx?.telegram);
    
    if (!ctx || !ctx.telegram) {
        console.warn('[TopupHandler] getNotificationService: ctx или ctx.telegram отсутствует!');
        return null;
    }
    
    // Используем функцию из userHandlers
    const notificationService = getNotificationServiceFromContext(ctx);
    
    if (notificationService) {
        console.log('[TopupHandler] getNotificationService: ✅ NotificationService найден');
    } else {
        console.warn('[TopupHandler] getNotificationService: ⚠️ NotificationService не найден');
    }
    
    return notificationService;
}

/**
 * Получает активную заявку на пополнение для пользователя (pending, с суммой > 0, в пределах времени оплаты)
 */
async function getActiveTopup(userChatId) {
    try {
        const paymentTimeMinutes = await settingsService.getPaymentTimeMinutes() || 30;
        const { database } = await import('../../database/db.js');
        const topup = await database.get(
            `SELECT * FROM topups
             WHERE user_chat_id = ?
             AND status = 'pending'
             AND amount > 0
             AND datetime(created_at, '+' || ? || ' minutes') >= datetime('now')
             ORDER BY created_at DESC
             LIMIT 1`,
            [userChatId, paymentTimeMinutes]
        );
        return topup || null;
    } catch (error) {
        console.error('[TopupHandler] Ошибка при получении активной заявки на пополнение:', error);
        return null;
    }
}

/**
 * Регистрирует обработчики пополнения баланса
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerTopupHandlers(bot) {
    console.log('[TopupHandler] Регистрация обработчиков пополнения...');

    // Обработчик кнопки "Пополнить"
    bot.action('topup_balance', async (ctx) => {
        const activeTopup = await getActiveTopup(ctx.from.id);

        if (activeTopup) {
            await ctx.reply(
                '❌ У вас есть активная заявка на пополнение, сначала завершите или отмените её, чтобы создать новую.',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📋 Перейти к активному пополнению', callback_data: `view_active_topup_${activeTopup.id}` }
                            ],
                            [
                                { text: '❌ Отменить активное пополнение', callback_data: `cancel_active_topup_${activeTopup.id}` }
                            ]
                        ]
                    }
                }
            );
            return;
        }

        await showTopupMenu(ctx);
    });

    // Обработка выбора метода пополнения баланса в личном кабинете
    bot.action(/^topup_method_(\d+)$/, async (ctx) => {
        const methodId = parseInt(ctx.match[1]);
        await showTopupMethod(ctx, methodId);
    });

    // Обработка подтверждения ТРАНСГРАН
    bot.action(/^confirm_transgran_(.+?)_([\d.]+)$/, async (ctx) => {
        console.log('[TopupHandler] Обработка подтверждения ТРАНСГРАН, callback_data:', ctx.callbackQuery?.data);
        try {
            let methodId = ctx.match[1];
            const amount = parseFloat(ctx.match[2]);

            // Если methodId содержит "card_", извлекаем число
            if (methodId.startsWith('card_')) {
                methodId = parseInt(methodId.replace('card_', ''));
            } else {
                methodId = parseInt(methodId);
            }

            console.log('[TopupHandler] methodId:', methodId, 'amount:', amount);
            await ctx.answerCbQuery();
            await showTopupMethod(ctx, methodId, amount, true);
        } catch (error) {
            console.error('[TopupHandler] Ошибка при обработке подтверждения ТРАНСГРАН:', error);
            await ctx.answerCbQuery('Произошла ошибка. Попробуйте еще раз.');
        }
    });

    // Обработка отмены ТРАНСГРАН
    bot.action(/^cancel_transgran_(.+?)$/, async (ctx) => {
        console.log('[TopupHandler] Обработка отмены ТРАНСГРАН, callback_data:', ctx.callbackQuery?.data);
        try {
            let methodId = ctx.match[1];

            // Если methodId содержит "card_", извлекаем число
            if (methodId.startsWith('card_')) {
                methodId = parseInt(methodId.replace('card_', ''));
            } else {
                methodId = parseInt(methodId);
            }

            console.log('[TopupHandler] methodId:', methodId);
            await ctx.answerCbQuery();

            // Удаляем предварительную запись о пополнении, если она была создана
            const { database } = await import('../../database/db.js');
            try {
                await database.run(
                    'DELETE FROM topups WHERE user_chat_id = ? AND payment_method_id = ? AND status = ? AND amount = 0',
                    [ctx.from.id, methodId, 'pending']
                );
            } catch (error) {
                console.error('[TopupHandler] Ошибка при удалении предварительной записи о пополнении:', error);
            }

            // Возвращаемся к выбору метода пополнения
            await showTopupMenu(ctx);
        } catch (error) {
            console.error('[TopupHandler] Ошибка при обработке отмены ТРАНСГРАН:', error);
            await ctx.answerCbQuery('Произошла ошибка. Попробуйте еще раз.');
        }
    });

    // Переход к активной заявке на пополнение
    bot.action(/^view_active_topup_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const topupId = parseInt(ctx.match[1]);

        const activeTopup = await getActiveTopup(ctx.from.id);
        if (!activeTopup || activeTopup.id !== topupId) {
            await ctx.reply('❌ Активная заявка на пополнение не найдена или время на оплату истекло.');
            return;
        }

        if (activeTopup.user_chat_id !== ctx.from.id) {
            await ctx.reply('❌ Это не ваша заявка.');
            return;
        }

        if (activeTopup.status !== 'pending' || !activeTopup.payment_method_id || !activeTopup.amount || activeTopup.amount <= 0) {
            await ctx.reply('❌ Эта заявка уже не активна.');
            return;
        }

        // Повторно показываем реквизиты по уже выбранному способу оплаты
        await showTopupMethod(ctx, activeTopup.payment_method_id, activeTopup.amount, true);
    });

    // Отмена активной заявки на пополнение
    bot.action(/^cancel_active_topup_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const topupId = parseInt(ctx.match[1]);
        const { database } = await import('../../database/db.js');

        try {
            const topup = await database.get(
                'SELECT * FROM topups WHERE id = ?',
                [topupId]
            );

            if (!topup || topup.user_chat_id !== ctx.from.id) {
                await ctx.reply('❌ Заявка не найдена или не принадлежит вам.');
                return;
            }

            if (topup.status !== 'pending') {
                await ctx.reply('❌ Эта заявка уже обработана.');
                return;
            }

            await database.run(
                'UPDATE topups SET status = ? WHERE id = ?',
                ['cancelled', topupId]
            );

            await ctx.reply(
                '❌ Заявка на пополнение отменена.\n\n⚠️ Не спамьте заявками на пополнение, иначе вы будете заблокированы в боте!'
            );

            const menuKeyboard = await getMenuKeyboard();
            await ctx.reply('🕹 Главное меню:', {
                reply_markup: menuKeyboard
            });
        } catch (error) {
            console.error('[TopupHandler] Ошибка при отмене активной заявки:', error);
            await ctx.reply('❌ Ошибка при отмене заявки.');
        }
    });

    console.log('[TopupHandler] Обработчики пополнения зарегистрированы');

    // Обработка кнопки "Скопировать реквизиты" для пополнения
    bot.action(/^copy_topup_(\d+)$/, async (ctx) => {
        const topupId = parseInt(ctx.match[1]);
        const { database } = await import('../../database/db.js');
        try {
            const topup = await database.get(
                'SELECT t.*, pm.type, pm.network, pa.address, ca.account_number FROM topups t ' +
                'LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id ' +
                'LEFT JOIN payment_addresses pa ON pa.payment_method_id = t.payment_method_id AND pa.id = (SELECT id FROM payment_addresses WHERE payment_method_id = t.payment_method_id ORDER BY created_at DESC LIMIT 1) ' +
                'LEFT JOIN card_accounts ca ON ca.id = (SELECT id FROM card_accounts WHERE enabled = 1 ORDER BY RANDOM() LIMIT 1) ' +
                'WHERE t.id = ?',
                [topupId]
            );

            if (!topup) {
                await ctx.answerCbQuery('Заявка не найдена');
                return;
            }

            const address = topup.type === 'card' ? topup.account_number : topup.address;
            if (address) {
                await ctx.answerCbQuery(`Реквизиты: ${address}`);
                await ctx.reply(`<code>${address}</code>`, { parse_mode: 'HTML' });
            } else {
                await ctx.answerCbQuery('Реквизиты не найдены');
            }
        } catch (error) {
            console.error('[TopupHandler] Ошибка при копировании реквизитов:', error);
            await ctx.answerCbQuery('Ошибка при копировании реквизитов');
        }
    });

    // Обработка кнопки "Отменить заявку"
    bot.action(/^cancel_topup_(\d+)$/, async (ctx) => {
        const topupId = parseInt(ctx.match[1]);
        const { database } = await import('../../database/db.js');
        try {
            await database.run(
                'UPDATE topups SET status = ? WHERE id = ?',
                ['cancelled', topupId]
            );
            await ctx.answerCbQuery('Заявка отменена');
            await ctx.editMessageText('❌ Заявка на пополнение отменена.\n\n⚠️ Не спамьте заявками на пополнение, иначе вы будете заблокированы в боте!'); 
            // 123
            


            // Возвращаем обычные кнопки меню
            const menuKeyboard = await getMenuKeyboard();
            await ctx.reply('🕹 Главное меню:', {
                reply_markup: menuKeyboard
            });
        } catch (error) {
            console.error('[TopupHandler] Ошибка при отмене заявки:', error);
            await ctx.answerCbQuery('Ошибка при отмене заявки');
        }
    });
}

/**
 * Показ меню пополнения
 */
export async function showTopupMenu(ctx) {
    try {
        const paymentMethods = await paymentService.getAllMethods();

        console.log('[TopupHandler] Все методы оплаты:', paymentMethods.map(m => `${m.name} (${m.type}, enabled: ${m.enabled})`));

        if (paymentMethods.length === 0) {
            if (ctx.callbackQuery) {
                await ctx.editMessageText('❌ Методы оплаты пока не настроены. Обратитесь к администратору.');
            } else {
                await ctx.reply('❌ Методы оплаты пока не настроены. Обратитесь к администратору.');
            }
            return;
        }

        const text = `💵 Выберите способ пополнения:`;

        // Создаем reply keyboard с методами оплаты (каждая кнопка в отдельном ряду для 100% ширины)
        const keyboard = [];
        for (const method of paymentMethods) {
            keyboard.push([method.name]); // Каждая кнопка в отдельном ряду
        }

        const hasTransgran = paymentMethods.some(m => m.name === 'ТРАНСГРАН');
        console.log('[TopupHandler] ТРАНСГРАН найден в списке методов:', hasTransgran);

        const replyMarkup = {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: false
        };

        // Отправляем сообщение с reply keyboard
        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
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
    } catch (error) {
        console.error('[TopupHandler] ОШИБКА в showTopupMenu:', error);
        if (ctx.callbackQuery) {
            await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}

/**
 * Показ реквизитов для выбранного метода пополнения
 */
export async function showTopupMethod(ctx, methodId, amount = null, skipWarning = false) {
    try {
        const method = await paymentService.getMethodById(methodId);
        if (!method) {
            await ctx.reply('Метод оплаты не найден.');
            return;
        }

        // Если сумма не указана, запрашиваем её и создаем запись в БД
        if (amount === null) {
            topupAmountMode.set(ctx.from.id, methodId);

            // Создаем запись о пополнении сразу при выборе метода (с суммой 0, потом обновим)
            const { database } = await import('../../database/db.js');
            try {
                const result = await database.run(
                    'INSERT INTO topups (user_chat_id, amount, payment_method_id, status) VALUES (?, ?, ?, ?)',
                    [ctx.from.id, 0, methodId, 'pending']
                );
                console.log('[TopupHandler] Создана предварительная запись о пополнении с ID:', result.lastID);
            } catch (error) {
                console.error('[TopupHandler] Ошибка при создании предварительной записи о пополнении:', error);
            }

            // Убираем reply keyboard с методами оплаты при запросе суммы
            await ctx.reply(
                '💵 Введите сумму пополнения (В рублях):\n\n',
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        remove_keyboard: true
                    }
                }
            );
            return;
        }

        // Проверяем, является ли метод ТРАНСГРАН (только если предупреждение еще не было показано)
        if (method.name === 'ТРАНСГРАН' && amount !== null && !skipWarning) {
            // Показываем предупреждение для ТРАНСГРАН
            const warningText = `⚠️ Оплата на реквизиты другой страны (СНГ).\nВы точно хотите продолжить?`;

            // Извлекаем числовой ID метода для callback_data
            // Если methodId строка типа "card_6", используем card_account_id или извлекаем число
            let numericMethodId = methodId;
            if (typeof methodId === 'string' && methodId.startsWith('card_')) {
                numericMethodId = methodId.replace('card_', '');
            } else if (method.card_account_id) {
                numericMethodId = method.card_account_id;
            } else if (method.id && typeof method.id === 'string' && method.id.startsWith('card_')) {
                numericMethodId = method.id.replace('card_', '');
            } else if (method.id) {
                numericMethodId = method.id;
            }

            // Формируем callback_data, используя числовой ID
            const confirmCallback = `confirm_transgran_${numericMethodId}_${amount}`;
            const cancelCallback = `cancel_transgran_${numericMethodId}`;
            console.log('[TopupHandler] Формирование callback_data для ТРАНСГРАН:');
            console.log('[TopupHandler] methodId (исходный):', methodId);
            console.log('[TopupHandler] numericMethodId:', numericMethodId);
            console.log('[TopupHandler] confirmCallback:', confirmCallback);
            console.log('[TopupHandler] cancelCallback:', cancelCallback);

            const warningMarkup = {
                inline_keyboard: [
                    [{ text: 'Да', callback_data: confirmCallback }],
                    [{ text: 'Нет', callback_data: cancelCallback }]
                ]
            };

            if (ctx.callbackQuery) {
                try {
                    await ctx.editMessageText(warningText, {
                        parse_mode: 'HTML',
                        reply_markup: warningMarkup
                    });
                } catch (error) {
                    await ctx.reply(warningText, {
                        parse_mode: 'HTML',
                        reply_markup: warningMarkup
                    });
                }
            } else {
                await ctx.reply(warningText, {
                    parse_mode: 'HTML',
                    reply_markup: warningMarkup
                });
            }
            return;
        }

        // Показываем сообщение об ожидании получения реквизитов
        const waitingMsg = await ctx.reply('🕗 Ожидание получения реквизитов..');

        // Добавляем задержку перед показом блока с заявкой (7 секунд)
        await new Promise(resolve => setTimeout(resolve, 7000));

        // Обновляем запись о пополнении с указанной суммой
        const { database } = await import('../../database/db.js');
        let topupId = null;
        try {
            const lastTopup = await database.get(
                'SELECT * FROM topups WHERE user_chat_id = ? AND payment_method_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
                [ctx.from.id, methodId, 'pending']
            );

            if (lastTopup && lastTopup.amount === 0) {
                await database.run(
                    'UPDATE topups SET amount = ? WHERE id = ?',
                    [amount, lastTopup.id]
                );
                topupId = lastTopup.id;
                console.log('[TopupHandler] Обновлена запись о пополнении ID:', lastTopup.id, 'Сумма:', amount);
            } else if (!lastTopup) {
                const result = await database.run(
                    'INSERT INTO topups (user_chat_id, amount, payment_method_id, status) VALUES (?, ?, ?, ?)',
                    [ctx.from.id, amount, methodId, 'pending']
                );
                topupId = result.lastID;
                console.log('[TopupHandler] Создана запись о пополнении с ID:', result.lastID, 'Сумма:', amount);
            } else {
                topupId = lastTopup.id;
            }
        } catch (error) {
            console.error('[TopupHandler] Ошибка при обновлении/создании записи о пополнении:', error);
        }

        const markupPercent = await settingsService.getGlobalMarkupPercent();
        const amountToTransfer = Math.round(amount * (1 + (markupPercent > 0 ? markupPercent : 0) / 100));
        const currencySymbol = await getCurrencySymbol();
        const amountCreditedText = `${amount.toLocaleString('ru-RU')} ${currencySymbol}`;

        let text = '';
        let cryptoAmount = null;
        let cryptoSymbol = '';

        if (method.type === 'card') {
            let cardAccount;
            if (method.card_account_id) {
                cardAccount = await cardAccountService.getById(method.card_account_id);
            } else if (method.name) {
                // Для ТРАНСГРАН и других карточных методов получаем случайную карту
                if (method.name === 'ТРАНСГРАН') {
                    cardAccount = await cardAccountService.getRandomCardByName('ТРАНСГРАН');
                } else {
                    cardAccount = await cardAccountService.getRandomCardByName(method.name);
                }
            }

            if (!cardAccount) {
                await ctx.reply('Карточный счет не найден. Обратитесь к администратору.');
                return;
            }

            // Получаем случайную карту из массива
            const cards = cardAccount.cards || [cardAccount.account_number];
            const randomCard = cards.length > 0
                ? cards[Math.floor(Math.random() * cards.length)]
                : cardAccount.account_number;

            const txid = topupId ? generateTXID(topupId) : 'None';
            const amountToTransferText = `${amountToTransfer.toLocaleString('ru-RU')} ${currencySymbol}`;
            text = generateTopupRequestText(topupId || 'N/A', txid, amountCreditedText, amountToTransferText, randomCard);
        } else {
            // Для криптовалюты конвертируем сумму к переводу (рубли с наценкой) в криптовалюту
            const conversion = await cryptoExchangeService.convertRublesToCrypto(amountToTransfer, method.network);

            if (conversion.error) {
                await ctx.reply(`❌ Ошибка при конвертации: ${conversion.error}`);
                return;
            }

            cryptoAmount = conversion.amount;
            cryptoSymbol = cryptoExchangeService.getCryptoSymbol(method.network);
            const formattedCryptoAmount = cryptoExchangeService.formatCryptoAmount(cryptoAmount, method.network);

            const address = await paymentService.getAddressForMethod(methodId);
            if (!address) {
                await ctx.reply('Адрес для пополнения не найден. Обратитесь к администратору.');
                return;
            }

            const txid = topupId ? generateTXID(topupId) : 'None';
            const amountToTransferText = `${formattedCryptoAmount} ${cryptoSymbol}`;
            text = generateTopupRequestText(topupId || 'N/A', txid, amountCreditedText, amountToTransferText, address.address);
        }

        // Создаем кнопки согласно изображению
        const replyMarkup = {
            inline_keyboard: [
                [{ text: 'Поддержка', callback_data: 'help_support' }],
                [{ text: '📋 Скопировать реквизиты', callback_data: `copy_topup_${topupId || '0'}` }],
                [{ text: 'Отменить заявку', callback_data: `cancel_topup_${topupId || '0'}` }]
            ]
        };

        // Отправляем уведомление о выборе реквизита для пополнения баланса
        console.log('[TopupHandler] handleTopupMethodSelection: Попытка получить NotificationService');
        const notificationService = getNotificationService(ctx);
        if (notificationService) {
            console.log('[TopupHandler] handleTopupMethodSelection: NotificationService получен, отправка уведомления');
            const amountToTransferText =
                method.type === 'card'
                    ? `${amountToTransfer.toLocaleString('ru-RU')} ${currencySymbol}`
                    : `${formattedCryptoAmount} ${cryptoSymbol}`;
            await notificationService.notifyTopupRequest(
                ctx.from.id,
                method.name,
                amountCreditedText,
                amountToTransferText
            );
        } else {
            console.warn('[TopupHandler] handleTopupMethodSelection: ⚠️ NotificationService не найден, уведомление не отправлено');
        }

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
    } catch (error) {
        console.error('[TopupHandler] ОШИБКА в showTopupMethod:', error);
        if (ctx.callbackQuery) {
            await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}
