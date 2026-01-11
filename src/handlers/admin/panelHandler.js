import { paymentService } from '../../services/paymentService.js';
import { cardAccountService } from '../../services/cardAccountService.js';
import { isAdmin } from './authHandler.js';

// Режим привязки канала
export const channelBindMode = new Map(); // userId -> true

/**
 * Главное меню админ-панели
 */
export async function showAdminPanel(ctx) {
    if (!isAdmin(ctx.from.id)) {
        await ctx.reply('❌ У вас нет доступа к админ-панели.');
        return;
    }

    // Получаем все криптовалютные адреса
    const cryptoMethods = await paymentService.getCryptoMethods();
    const cryptoAddresses = [];
    for (const method of cryptoMethods) {
        const address = await paymentService.getAddressForMethod(method.id);
        if (address) {
            cryptoAddresses.push(`${method.name} (${method.network}): <code>${address.address}</code>`);
        }
    }

    // Получаем все карточные счета
    const cardAccounts = await cardAccountService.getAll(true);
    const cardAccountsList = cardAccounts.map(card =>
        `${card.name}: <code>${card.account_number}</code>`
    );

    let addressesText = '';
    if (cryptoAddresses.length > 0) {
        addressesText += '\n\n<b>💎 Криптовалютные адреса:</b>\n' + cryptoAddresses.join('\n');
    }
    if (cardAccountsList.length > 0) {
        addressesText += '\n\n<b>💳 Карточные счета:</b>\n' + cardAccountsList.join('\n');
    }
    if (cryptoAddresses.length === 0 && cardAccountsList.length === 0) {
        addressesText = '\n\n⚠️ Адреса еще не настроены';
    }

    const text = `
🔐 <b>Админ-панель</b>
${addressesText}

Выберите раздел для управления:
    `.trim();

    await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🏙️ Управление городами', callback_data: 'admin_cities' }],
                [{ text: '📦 Управление товарами', callback_data: 'admin_products' }],
                [{ text: '⚖️ Управление фасовками', callback_data: 'admin_packagings' }],
                [{ text: '💳 Управление методами оплаты', callback_data: 'admin_payments' }],
                [{ text: '💳 Управление карточными счетами', callback_data: 'admin_cards' }],
                [{ text: '💬 Чаты', callback_data: 'admin_chats' }],
                [{ text: '📢 Создать уведомление', callback_data: 'admin_notification' }],
                [{ text: '💾 Данные', callback_data: 'admin_data' }],
                [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
                [{ text: '👋 Настройка приветственного сообщения', callback_data: 'admin_welcome' }],
                [{ text: '🔘 Настройка кнопок', callback_data: 'admin_menu_buttons' }],
                [{ text: '🎨 Настройка иконок', callback_data: 'admin_icons' }],
                [{ text: '🎁 Бонусы и промокоды', callback_data: 'admin_promocodes' }],
                [{ text: '👥 Настройка реферальной системы', callback_data: 'admin_referrals' }],
                [{ text: '📢 Привязать телеграм-канал', callback_data: 'admin_bind_channel' }],
                [{ text: '💬 Управление отзывами', callback_data: 'admin_reviews' }],
                [{ text: '🏪 Изменить название витрины', callback_data: 'admin_storefront_name' }],
                [{ text: '💰 Изменить валюту', callback_data: 'admin_currency' }],
                [{ text: '👥 Пользователи', callback_data: 'admin_users' }],
                [{ text: '🚪 Выход из админ-панели', callback_data: 'admin_logout' }]
            ]
        }
    });
}

/**
 * Регистрирует обработчик главной панели
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerPanelHandlers(bot) {
    bot.action('admin_panel', async (ctx) => {
        await showAdminPanel(ctx);
    });
}
