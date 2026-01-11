import { settingsService } from '../../services/settingsService.js';
import { isAdmin } from './authHandler.js';
import { showAdminPanel } from './panelHandler.js';

// Режимы редактирования
export const welcomeEditMode = new Map(); // userId -> true
export const iconEditMode = new Map(); // userId -> true
export const referralDiscountEditMode = new Map(); // userId -> 'discount' | 'max_discount' | 'cashback'
export const storefrontNameEditMode = new Map(); // userId -> true
export const currencyEditMode = new Map(); // userId -> true

/**
 * Регистрирует обработчики настроек
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerSettingsHandlers(bot) {
    bot.action('admin_settings', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showSettingsMenu(ctx);
    });

    bot.action('admin_settings_welcome', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showWelcomeSettings(ctx);
    });

    bot.action('edit_welcome', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        welcomeEditMode.set(ctx.from.id, true);
        await ctx.reply(
            '✏️ <b>Редактирование приветственного сообщения</b>\n\n' +
            'Отправьте новое приветственное сообщение.\n' +
            'Вы можете использовать HTML разметку для форматирования.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('view_welcome', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const currentMessage = await settingsService.getWelcomeMessage();
        await ctx.reply(
            '👁️ <b>Текущее приветственное сообщение:</b>\n\n' +
            `<pre>${currentMessage}</pre>`,
            { parse_mode: 'HTML' }
        );
        await showWelcomeSettings(ctx);
    });

    bot.action('admin_settings_icons', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showIconsSettings(ctx);
    });

    bot.action('edit_city_icon', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        iconEditMode.set(ctx.from.id, true);
        await ctx.reply(
            '✏️ <b>Редактирование иконки для городов</b>\n\n' +
            'Отправьте новую иконку (эмодзи или символ).\n' +
            'Например: 📍, 🏙️, 🏛️, 🗺️ и т.д.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('view_city_icon', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const currentIcon = await settingsService.getCityIcon();
        await ctx.reply(
            '👁️ <b>Текущая иконка для городов:</b>\n\n' +
            `<b>${currentIcon}</b>\n\n` +
            `Пример использования: ${currentIcon} Москва`,
            { parse_mode: 'HTML' }
        );
        await showIconsSettings(ctx);
    });

    bot.action('admin_settings_referral', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showReferralSettings(ctx);
    });

    bot.action('edit_referral_discount', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        referralDiscountEditMode.set(ctx.from.id, 'discount');
        await ctx.reply(
            '✏️ <b>Редактирование скидки за реферала</b>\n\n' +
            'Введите новый процент скидки за каждого реферала (например: 1.5).\n' +
            'Текущее значение: ' + (await settingsService.getReferralDiscountPercent()) + '%\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('edit_max_referral_discount', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        referralDiscountEditMode.set(ctx.from.id, 'max_discount');
        await ctx.reply(
            '✏️ <b>Редактирование максимальной скидки</b>\n\n' +
            'Введите максимальный процент скидки (например: 8).\n' +
            'Текущее значение: ' + (await settingsService.getMaxReferralDiscountPercent()) + '%\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('edit_referral_cashback', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        referralDiscountEditMode.set(ctx.from.id, 'cashback');
        await ctx.reply(
            '✏️ <b>Редактирование процента кешбека</b>\n\n' +
            'Введите процент кешбека, который будет начисляться при покупке реферала (например: 5).\n' +
            'Текущее значение: ' + (await settingsService.getReferralCashbackPercent()) + '%\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('admin_settings_storefront', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showStorefrontNameSettings(ctx);
    });

    bot.action('edit_storefront_name', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        storefrontNameEditMode.set(ctx.from.id, true);
        const currentName = await settingsService.getStorefrontName();
        await ctx.reply(
            '✏️ <b>Редактирование названия витрины</b>\n\n' +
            `Текущее название: <b>${currentName}</b>\n\n` +
            'Отправьте новое название витрины.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('admin_settings_currency', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCurrencySettings(ctx);
    });

    bot.action('admin_currency', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ У вас нет доступа');
            return;
        }
        await ctx.answerCbQuery();
        await showCurrencySettings(ctx);
    });

    bot.action('edit_currency', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        currencyEditMode.set(ctx.from.id, true);
        const currentSymbol = await settingsService.getCurrencySymbol();
        await ctx.reply(
            '✏️ <b>Редактирование символа валюты</b>\n\n' +
            `Текущий символ: <b>${currentSymbol}</b>\n\n` +
            'Отправьте новый символ валюты (например: $, €, ₽, ₴ и т.д.).\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('admin_welcome', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ У вас нет доступа');
            return;
        }
        await ctx.answerCbQuery();
        await showWelcomeSettings(ctx);
    });

    bot.action('admin_icons', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ У вас нет доступа');
            return;
        }
        await ctx.answerCbQuery();
        await showIconsSettings(ctx);
    });

    bot.action('admin_referrals', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ У вас нет доступа');
            return;
        }
        await ctx.answerCbQuery();
        await showReferralSettings(ctx);
    });

    bot.action('admin_storefront_name', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ У вас нет доступа');
            return;
        }
        await ctx.answerCbQuery();
        await showStorefrontNameSettings(ctx);
    });
}

/**
 * Показ меню настроек
 */
export async function showSettingsMenu(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const text = `
⚙️ <b>Настройки бота</b>

Выберите настройку для изменения:
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [{ text: '👋 Приветственное сообщение', callback_data: 'admin_settings_welcome' }],
            [{ text: '🔘 Настройка кнопок', callback_data: 'admin_menu_buttons' }],
            [{ text: '🎨 Иконки', callback_data: 'admin_settings_icons' }],
            [{ text: '🎁 Бонусы и промокоды', callback_data: 'admin_promocodes' }],
            [{ text: '👥 Реферальная система', callback_data: 'admin_settings_referral' }],
            [{ text: '📢 Привязать телеграм-канал', callback_data: 'admin_bind_channel' }],
            [{ text: '💬 Управление отзывами', callback_data: 'admin_reviews' }],
            [{ text: '🏪 Изменить название витрины', callback_data: 'admin_storefront_name' }],
            [{ text: '💱 Изменить валюту', callback_data: 'admin_currency' }],
            [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
            [{ text: '💾 Данные', callback_data: 'admin_data' }],
            [{ text: '💬 Чаты', callback_data: 'admin_chats' }],
            [{ text: '📢 Создать уведомление', callback_data: 'admin_notification' }],
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

/**
 * Показ настроек приветственного сообщения
 */
export async function showWelcomeSettings(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const currentMessage = await settingsService.getWelcomeMessage();

    const text = `
👋 <b>Настройка приветственного сообщения</b>

Текущее приветственное сообщение:

<pre>${currentMessage.substring(0, 200)}${currentMessage.length > 200 ? '...' : ''}</pre>

Выберите действие:
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [{ text: '✏️ Редактировать сообщение', callback_data: 'edit_welcome' }],
            [{ text: '👁️ Просмотреть полный текст', callback_data: 'view_welcome' }],
            [{ text: '◀️ Назад', callback_data: 'admin_settings' }]
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

/**
 * Показ настроек иконок
 */
export async function showIconsSettings(ctx) {
    const currentIcon = await settingsService.getCityIcon();

    const text = `🎨 <b>Настройка иконок</b>\n\n` +
        `Текущая иконка для городов: <b>${currentIcon}</b>\n\n` +
        `Выберите действие:`;

    const keyboard = {
        inline_keyboard: [
            [{ text: '✏️ Изменить иконку городов', callback_data: 'edit_city_icon' }],
            [{ text: '👁️ Просмотреть текущую иконку', callback_data: 'view_city_icon' }],
            [{ text: '◀️ Назад', callback_data: 'admin_settings' }]
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

/**
 * Показ настроек реферальной системы
 */
export async function showReferralSettings(ctx) {
    const discountPercent = await settingsService.getReferralDiscountPercent();
    const maxDiscount = await settingsService.getMaxReferralDiscountPercent();
    const cashbackPercent = await settingsService.getReferralCashbackPercent();

    const text = `👥 <b>Настройка реферальной системы</b>\n\n` +
        `Текущие настройки:\n` +
        `• Скидка за реферала: <b>${discountPercent}%</b>\n` +
        `• Максимальная скидка: <b>${maxDiscount}%</b>\n` +
        `• Кешбек при покупке реферала: <b>${cashbackPercent}%</b>\n\n` +
        `Выберите настройку для изменения:`;

    const keyboard = {
        inline_keyboard: [
            [{ text: '✏️ Изменить скидку за реферала', callback_data: 'edit_referral_discount' }],
            [{ text: '✏️ Изменить максимальную скидку', callback_data: 'edit_max_referral_discount' }],
            [{ text: '✏️ Изменить процент кешбека', callback_data: 'edit_referral_cashback' }],
            [{ text: '◀️ Назад', callback_data: 'admin_settings' }]
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

/**
 * Показ настроек названия витрины
 */
export async function showStorefrontNameSettings(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const currentName = await settingsService.getStorefrontName();

    const text = `
🏪 <b>Настройка названия витрины</b>

Текущее название: <b>${currentName}</b>

Выберите действие:
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [{ text: '✏️ Изменить название', callback_data: 'edit_storefront_name' }],
            [{ text: '◀️ Назад', callback_data: 'admin_settings' }]
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

/**
 * Показ настроек валюты
 */
export async function showCurrencySettings(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const currentSymbol = await settingsService.getCurrencySymbol();

    const text = `
💱 <b>Настройка валюты</b>

Текущий символ валюты: <b>${currentSymbol}</b>

Выберите действие:
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [{ text: '✏️ Изменить символ валюты', callback_data: 'edit_currency' }],
            [{ text: '◀️ Назад', callback_data: 'admin_settings' }]
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
