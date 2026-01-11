import { promocodeService } from '../../services/promocodeService.js';
import { userService } from '../../services/userService.js';
import { isAdmin } from './authHandler.js';

// Режимы работы с промокодами
export const promocodeAddMode = new Map(); // userId -> true
export const promocodeAssignMode = new Map(); // userId -> promocodeId
export const promocodeAssignAllMode = new Map(); // userId -> promocodeId

/**
 * Регистрирует обработчики промокодов
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerPromocodesHandlers(bot) {
    bot.action('admin_promocodes', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPromocodesAdmin(ctx);
    });

    bot.action('admin_promocode_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        promocodeAddMode.set(ctx.from.id, true);
        await ctx.reply(
            '➕ <b>Добавление нового промокода</b>\n\n' +
            'Отправьте данные в формате:\n' +
            '<code>КОД|ПРОЦЕНТ_СКИДКИ</code>\n\n' +
            'Пример:\n' +
            '<code>SUMMER2024|15</code>\n\n' +
            'Процент скидки должен быть от 1 до 99.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('admin_promocode_assign_user', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const promocodes = await promocodeService.getAll(true);

        if (promocodes.length === 0) {
            await ctx.editMessageText('Нет активных промокодов для выдачи.');
            return;
        }

        const keyboard = promocodes.map(promo => [
            { text: `${promo.code} (${promo.discount_percent}%)`, callback_data: `admin_promocode_assign_user_select_${promo.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_promocodes' }]);

        await ctx.editMessageText('Выберите промокод для выдачи пользователю:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_promocode_assign_user_select_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const promocodeId = parseInt(ctx.match[1]);
        promocodeAssignMode.set(ctx.from.id, promocodeId);

        const users = await userService.getAllUsers();

        if (users.length === 0) {
            await ctx.editMessageText('Нет пользователей для выдачи промокода.');
            return;
        }

        // Показываем список пользователей (первые 50)
        const usersList = users.slice(0, 50);
        const keyboard = usersList.map(user => [
            { text: `👤 Пользователь ${user.chat_id}`, callback_data: `admin_promocode_assign_to_${user.chat_id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_promocodes' }]);

        await ctx.editMessageText(
            `Выберите пользователя для выдачи промокода:\n\n` +
            `(Показано ${usersList.length} из ${users.length} пользователей)`,
            {
                reply_markup: { inline_keyboard: keyboard }
            }
        );
    });

    bot.action(/^admin_promocode_assign_to_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const userChatId = parseInt(ctx.match[1]);
        const promocodeId = promocodeAssignMode.get(ctx.from.id);

        if (!promocodeId) {
            await ctx.editMessageText('Ошибка: промокод не выбран.');
            return;
        }

        try {
            const promocode = await promocodeService.getById(promocodeId);
            await promocodeService.assignToUser(userChatId, promocodeId);

            const message = `Спасибо за использование нашего магазина, мы решили подарить вам промокод на следующие покупки, спасибо, что вы с нами! Ваш промокод: <b>${promocode.code}</b>`;

            try {
                await bot.telegram.sendMessage(userChatId, message, { parse_mode: 'HTML' });
                await ctx.editMessageText(`✅ Промокод ${promocode.code} успешно выдан пользователю!`);
            } catch (error) {
                await ctx.editMessageText(`✅ Промокод выдан, но не удалось отправить сообщение пользователю: ${error.message}`);
            }

            promocodeAssignMode.delete(ctx.from.id);
            await showPromocodesAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_promocode_assign_all', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const promocodes = await promocodeService.getAll(true);

        if (promocodes.length === 0) {
            await ctx.editMessageText('Нет активных промокодов для выдачи.');
            return;
        }

        const keyboard = promocodes.map(promo => [
            { text: `${promo.code} (${promo.discount_percent}%)`, callback_data: `admin_promocode_assign_all_confirm_${promo.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_promocodes' }]);

        await ctx.editMessageText('Выберите промокод для выдачи всем пользователям:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_promocode_assign_all_confirm_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const promocodeId = parseInt(ctx.match[1]);

        try {
            const promocode = await promocodeService.getById(promocodeId);
            await ctx.editMessageText('📢 Выдача промокода всем пользователям...');

            const results = await promocodeService.assignToAllUsers(promocodeId);
            const assignedCount = results.filter(r => r.assigned).length;
            const alreadyAssignedCount = results.length - assignedCount;

            const message = `Спасибо за использование нашего магазина, мы решили подарить вам промокод на следующие покупки, спасибо, что вы с нами! Ваш промокод: <b>${promocode.code}</b>`;

            // Отправляем сообщение всем пользователям
            let sentCount = 0;
            let failedCount = 0;

            for (const result of results) {
                if (result.assigned) {
                    try {
                        await bot.telegram.sendMessage(result.user_chat_id, message, { parse_mode: 'HTML' });
                        sentCount++;
                    } catch (error) {
                        failedCount++;
                    }
                }
            }

            await ctx.editMessageText(
                `✅ Промокод ${promocode.code} выдан всем пользователям!\n\n` +
                `Выдано: ${assignedCount}\n` +
                `Уже было выдано: ${alreadyAssignedCount}\n` +
                `Сообщений отправлено: ${sentCount}\n` +
                `Ошибок отправки: ${failedCount}`
            );
            await showPromocodesAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });
}

/**
 * Показ меню управления промокодами
 */
export async function showPromocodesAdmin(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const promocodes = await promocodeService.getAll(true); // Только активные

    let text = '🎁 <b>Бонусы и промокоды</b>\n\n';

    if (promocodes.length === 0) {
        text += 'Нет используемых промокодов.\n';
    } else {
        text += '<b>Действующие промокоды:</b>\n\n';
        for (const promo of promocodes) {
            const expiresText = promo.expires_at
                ? ` (до ${new Date(promo.expires_at).toLocaleDateString('ru-RU')})`
                : ' (без срока действия)';
            text += `• <b>${promo.code}</b> - ${promo.discount_percent}%${expiresText}\n`;
        }
    }

    const keyboard = {
        inline_keyboard: [
            [{ text: '➕ Добавить промокод', callback_data: 'admin_promocode_add' }],
            [{ text: '👤 Выдать промокод пользователю', callback_data: 'admin_promocode_assign_user' }],
            [{ text: '📢 Выдать промокод всем', callback_data: 'admin_promocode_assign_all' }],
            [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
        ]
    };

    if (ctx.callbackQuery) {
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
    } else {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    }
}
