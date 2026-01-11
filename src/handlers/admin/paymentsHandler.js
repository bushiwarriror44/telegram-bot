import { paymentService } from '../../services/paymentService.js';
import { isAdmin } from './authHandler.js';

/**
 * Регистрирует обработчики управления методами оплаты
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerPaymentsHandlers(bot) {
    bot.action('admin_payments', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPaymentsAdmin(ctx);
    });

    bot.hears('Управление методами оплаты', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPaymentsAdmin(ctx);
    });

    bot.action('admin_payment_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            'Введите данные нового метода оплаты:\n\n' +
            'Для криптовалюты:\n' +
            'Формат: <code>/addpayment Название|Сеть</code>\n' +
            'Пример: /addpayment Bitcoin|BTC\n\n' +
            'Для карты:\n' +
            'Формат: <code>/addpayment Название|CARD|card</code>\n' +
            'Пример: /addpayment Карта|CARD|card',
            { parse_mode: 'HTML' }
        );
    });

    bot.command('addpayment', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1).join(' ').split('|');

        if (args.length < 2) {
            await ctx.reply('❌ Неверный формат.\nФормат: /addpayment Название|Сеть\nДля карты: /addpayment Название|CARD|card');
            return;
        }

        const [name, network, type] = args;
        const paymentType = type ? type.trim().toLowerCase() : 'crypto';
        const networkUpper = network.trim().toUpperCase();

        // Если это карта, проверяем что network = CARD
        if (paymentType === 'card' && networkUpper !== 'CARD') {
            await ctx.reply('❌ Для карточного метода оплаты укажите сеть как CARD');
            return;
        }

        try {
            await paymentService.createMethod(name.trim(), networkUpper, paymentType);
            await ctx.reply(`✅ Метод оплаты "${name}" успешно добавлен!`);
            await showPaymentsAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    // Команда для проверки и создания ТРАНСГРАН
    bot.command('checktransgran', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        try {
            const { cardAccountService } = await import('../../services/cardAccountService.js');
            const allMethods = await paymentService.getAllMethods(true);
            const transgranMethod = allMethods.find(m => m.name === 'ТРАНСГРАН');

            let message = '📋 Проверка ТРАНСГРАН:\n\n';

            if (transgranMethod) {
                message += `✅ Метод оплаты ТРАНСГРАН найден:\n`;
                message += `   - ID: ${transgranMethod.id}\n`;
                message += `   - Тип: ${transgranMethod.type}\n`;
                message += `   - Сеть: ${transgranMethod.network}\n`;
                message += `   - Включен: ${transgranMethod.enabled ? 'Да' : 'Нет'}\n\n`;

                if (!transgranMethod.enabled) {
                    await paymentService.enableMethod(transgranMethod.id, true);
                    message += `✅ Метод ТРАНСГРАН включен!\n\n`;
                }
            } else {
                message += `❌ Метод оплаты ТРАНСГРАН не найден. Создаю...\n\n`;
                try {
                    await paymentService.createMethod('ТРАНСГРАН', 'TRANSGRAN', 'card');
                    message += `✅ Метод ТРАНСГРАН создан!\n\n`;
                } catch (error) {
                    message += `❌ Ошибка при создании: ${error.message}\n\n`;
                }
            }

            // Проверяем карточный счет
            const transgranCard = await cardAccountService.getByName('ТРАНСГРАН');
            if (transgranCard) {
                message += `✅ Карточный счет ТРАНСГРАН найден:\n`;
                message += `   - Номер: ${transgranCard.account_number}\n`;
                message += `   - Включен: ${transgranCard.enabled ? 'Да' : 'Нет'}\n`;
            } else {
                message += `❌ Карточный счет ТРАНСГРАН не найден. Создаю...\n`;
                try {
                    await cardAccountService.create('ТРАНСГРАН', '4276 1234 5678 9012');
                    message += `✅ Карточный счет ТРАНСГРАН создан!\n`;
                } catch (error) {
                    message += `❌ Ошибка при создании счета: ${error.message}\n`;
                }
            }

            await ctx.reply(message);
        } catch (error) {
            console.error('[PaymentsHandler] Ошибка при проверке ТРАНСГРАН:', error);
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_payment_address', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const methods = await paymentService.getAllMethods();

        if (methods.length === 0) {
            await ctx.editMessageText('Нет методов оплаты.');
            return;
        }

        const keyboard = methods.map(method => [
            { text: `${method.name}`, callback_data: `admin_payment_addr_${method.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_payments' }]);

        await ctx.editMessageText('Выберите метод оплаты для изменения реквизитов:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_payment_addr_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const methodId = parseInt(ctx.match[1]);
        await ctx.editMessageText(
            `Введите новый адрес для оплаты:\n\nФормат: <code>/setaddress ${methodId} Адрес</code>`,
            { parse_mode: 'HTML' }
        );
    });

    bot.command('setaddress', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1);
        const methodId = parseInt(args[0]);
        const address = args.slice(1).join(' ');

        if (!address) {
            await ctx.reply('❌ Укажите адрес.\nФормат: /setaddress methodId Адрес');
            return;
        }

        try {
            await paymentService.updateMethodAddress(methodId, address);
            await ctx.reply(`✅ Адрес для метода оплаты успешно обновлен!`);
            await showPaymentsAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_payment_delete', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const methods = await paymentService.getAllMethods(true);

        if (methods.length === 0) {
            await ctx.editMessageText('Нет методов оплаты для удаления.');
            return;
        }

        const keyboard = methods.map(method => [
            { text: `🗑️ ${method.name}`, callback_data: `admin_payment_del_${method.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_payments' }]);

        await ctx.editMessageText('Выберите метод оплаты для удаления:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_payment_del_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const methodId = parseInt(ctx.match[1]);

        try {
            await paymentService.deleteMethod(methodId);
            await ctx.editMessageText('✅ Метод оплаты успешно удален!');
            await showPaymentsAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });
}

/**
 * Показ меню управления методами оплаты
 */
export async function showPaymentsAdmin(ctx) {
    const methods = await paymentService.getAllMethods(true);

    const text = `
💳 <b>Управление методами оплаты</b>

Доступные методы:
${methods.map(m => `• ${m.name} (${m.network})`).join('\n') || 'Методов оплаты пока нет'}
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [{ text: '➕ Добавить метод оплаты', callback_data: 'admin_payment_add' }],
            [{ text: '🔐 Изменить реквизиты', callback_data: 'admin_payment_address' }],
            [{ text: '🗑️ Удалить метод оплаты', callback_data: 'admin_payment_delete' }],
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
