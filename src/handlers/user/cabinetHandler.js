import { userService } from '../../services/userService.js';
import { getCurrencySymbol } from '../../utils/currencyHelper.js';
import { getOrdersByUser, getTopupsByUser } from '../../utils/dataHelpers.js';
import { formatDate, formatOrderDate } from '../../utils/textFormatters.js';
import { generateTXID } from '../../utils/textFormatters.js';
import { orderService } from '../../services/orderService.js';
import { referralService } from '../../services/referralService.js';
import { getMenuKeyboard } from '../../utils/keyboardHelpers.js';

/**
 * Регистрирует обработчики кабинета
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerCabinetHandlers(bot) {
    // Обработчик кнопки личного кабинета
    bot.action('cabinet_menu', async (ctx) => {
        await showCabinetMenu(ctx);
    });

    // Обработчик кнопки "Мои заказы"
    bot.action('my_orders', async (ctx) => {
        await showMyOrders(ctx);
    });

    // Обработчик кнопки "История пополнений"
    bot.action('topup_history', async (ctx) => {
        await showTopupHistory(ctx);
    });

    // Обработчик кнопки "Мои рефералы"
    bot.action('my_referrals', async (ctx) => {
        await showReferrals(ctx);
    });
}

/**
 * Показ меню кабинета
 */
export async function showCabinetMenu(ctx) {
    try {
        console.log('[CabinetHandler] showCabinetMenu вызван');
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });

        const user = await userService.getByChatId(ctx.from.id);
        const balance = user?.balance || 0;
        const currencySymbol = await getCurrencySymbol();

        const text = `👤 ${ctx.from.username ? '@' + ctx.from.username : 'Не указано'}
💵 <b>Баланс: ${balance.toFixed(2)} ${currencySymbol}</b>`;

        const keyboard = [
            [{ text: '💳 Пополнить', callback_data: 'topup_balance' }],
            [{ text: '🌶 Реферальная система', callback_data: 'my_referrals' }],
            [{ text: '📦 Мои заказы', callback_data: 'my_orders' }],
            [{ text: '💰 История пополнений', callback_data: 'topup_history' }],
        ];

        const replyMarkup = {
            inline_keyboard: keyboard
        };

        console.log('[CabinetHandler] Отправка меню кабинета');
        console.log('[CabinetHandler] Это callback?', !!ctx.callbackQuery);

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                console.log('[CabinetHandler] Меню кабинета отправлено через editMessageText');
            } catch (error) {
                console.error('[CabinetHandler] Ошибка при editMessageText:', error);
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                console.log('[CabinetHandler] Меню кабинета отправлено через reply (fallback)');
            }
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
            console.log('[CabinetHandler] Меню кабинета отправлено через reply');
        }
    } catch (error) {
        console.error('[CabinetHandler] ОШИБКА в showCabinetMenu:', error);
        console.error('[CabinetHandler] Stack:', error.stack);
        try {
            if (ctx.callbackQuery) {
                await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
            } else {
                await ctx.reply('Произошла ошибка. Попробуйте позже.');
            }
        } catch (e) {
            console.error('[CabinetHandler] Ошибка при отправке сообщения об ошибке:', e);
        }
    }
}

/**
 * Показ списка заказов
 */
export async function showMyOrders(ctx) {
    try {
        const orders = await getOrdersByUser(ctx.from.id);

        if (orders.length === 0) {
            const text = `📄 Список заказов:\n\nУ вас пока нет заказов.`;

            if (ctx.callbackQuery) {
                try {
                    await ctx.answerCbQuery();
                    await ctx.editMessageText(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                } catch (error) {
                    await ctx.reply(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                }
            } else {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                        ]
                    }
                });
            }
            return;
        }

        // Собираем все кнопки заказов
        const orderButtons = [];
        for (const order of orders) {
            const formattedDate = formatOrderDate(order.created_at);
            const orderText = `Заказ #${order.order_number ?? order.id} | ${formattedDate}`;

            // Определяем, является ли заказ отмененным или неоплаченным
            const isCancelledOrUnpaid = order.status === 'cancelled' ||
                order.status === 'pending' ||
                (order.status !== 'completed' && order.status !== 'paid');

            // Красная кнопка для неоплаченных/отмененных, зеленая для оплаченных
            const buttonText = isCancelledOrUnpaid
                ? `🔴 ${orderText}`
                : `🟢 ${orderText}`;

            // Каждая кнопка на отдельной строке (100% ширины)
            orderButtons.push([{
                text: buttonText,
                callback_data: `view_order_${order.id}`
            }]);
        }

        // Отправляем заголовок со всеми кнопками
        const headerText = `📄 Список заказов:`;

        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText(headerText, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: orderButtons
                    }
                });
            } catch (error) {
                await ctx.reply(headerText, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: orderButtons
                    }
                });
            }
        } else {
            await ctx.reply(headerText, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: orderButtons
                }
            });
        }
    } catch (error) {
        console.error('[CabinetHandler] ОШИБКА в showMyOrders:', error);
        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
            } catch (e) {
                await ctx.reply('Произошла ошибка. Попробуйте позже.');
            }
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}

/**
 * Показ истории пополнений
 */
export async function showTopupHistory(ctx) {
    try {
        const topups = await getTopupsByUser(ctx.from.id);

        if (topups.length === 0) {
            const text = `
🧾 <b>История пополнений</b>

У вас пока нет пополнений.
            `.trim();

            if (ctx.callbackQuery) {
                try {
                    await ctx.answerCbQuery();
                    await ctx.editMessageText(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                } catch (error) {
                    await ctx.reply(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                }
            } else {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                        ]
                    }
                });
            }
            return;
        }

        const totalTopups = topups.length;
        console.log('[CabinetHandler] Количество пополнений:', totalTopups);

        let text = `🧾 <b>История пополнений [${totalTopups}/${totalTopups}]:</b>\n\n`;

        const currencySymbol = await getCurrencySymbol();
        for (const topup of topups) {
            const statusText = topup.status === 'pending' ? 'не оплачен' : topup.status === 'completed' ? 'оплачен' : 'отменен';
            const txid = generateTXID(topup.id);
            const formattedDate = formatDate(topup.created_at);

            text += `💸 <b>Пополнение #${topup.id} (${statusText}):</b>\n`;
            text += `<b>Сумма:</b> <code>${topup.amount.toLocaleString('ru-RU')}</code> ${currencySymbol}\n`;
            text += `<b>TXID:</b> <code>${txid}</code>\n`;
            text += `<b>Дата:</b> <code>${formattedDate}</code>\n\n`;
        }

        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                        ]
                    }
                });
                console.log('[CabinetHandler] Сообщение успешно отредактировано');
            } catch (error) {
                console.error('[CabinetHandler] Ошибка при редактировании сообщения:', error);
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                        ]
                    }
                });
                console.log('[CabinetHandler] Сообщение отправлено как новое');
            }
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                    ]
                }
            });
            console.log('[CabinetHandler] Сообщение отправлено через reply');
        }
    } catch (error) {
        console.error('[CabinetHandler] ОШИБКА в showTopupHistory:', error);
        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
            } catch (e) {
                await ctx.reply('Произошла ошибка. Попробуйте позже.');
            }
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}

/**
 * Показ реферальной системы
 */
export async function showReferrals(ctx) {
    try {
        // Генерируем или получаем реферальную ссылку
        const referralCode = await referralService.getOrCreateReferralCode(ctx.from.id);
        const botUsername = ctx.botInfo?.username || (await ctx.telegram.getMe()).username || 'your_bot';
        const referralLink = `https://t.me/${botUsername}?start=ref_${referralCode}`;

        const text = `🌶 Ваша реферральная ссылка:\n\n${referralLink}`;

        const keyboard = [
            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
        ];

        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await ctx.reply(text, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    } catch (error) {
        console.error('[CabinetHandler] ОШИБКА в showReferrals:', error);
        if (ctx.callbackQuery) {
            await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}
