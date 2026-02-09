import { settingsService } from './settingsService.js';
import { userService } from './userService.js';
import { orderService } from './orderService.js';

export class NotificationService {
    constructor(bot, botUsername = null) {
        this.bot = bot;
        this.botUsername = botUsername;
    }

    /**
     * Формирует строку с информацией о боте (username или ссылка)
     */
    getBotInfo() {
        if (!this.botUsername) return '';
        // Формируем ссылку на бота: @username или ссылка t.me/username
        return `\n🤖 Бот: <a href="https://t.me/${this.botUsername}">@${this.botUsername}</a>`;
    }

    /**
     * Отправляет уведомление в канал
     */
    async sendToChannel(message, parseMode = 'HTML') {
        try {
            const channelId = await settingsService.getNotificationChannelId();
            if (!channelId) {
                console.log('[NotificationService] Канал не привязан, уведомление не отправлено');
                return false;
            }

            await this.bot.telegram.sendMessage(channelId, message, {
                parse_mode: parseMode
            });
            console.log('[NotificationService] Уведомление отправлено в канал:', channelId);
            return true;
        } catch (error) {
            console.error('[NotificationService] Ошибка при отправке уведомления в канал:', error);
            return false;
        }
    }

    /**
     * Уведомление о создании заказа
     */
    async notifyOrderCreated(orderId) {
        try {
            const order = await orderService.getById(orderId);
            if (!order) return;

            const user = await userService.getByChatId(order.user_chat_id);
            const username = user?.username ? `@${user.username}` : `ID: ${order.user_chat_id}`;
            const name = user?.first_name || 'Неизвестно';

            // Получаем время на оплату из настроек
            const paymentTimeMinutes = await settingsService.getPaymentTimeMinutes();

            const currencySymbol = await settingsService.getCurrencySymbol();
            const botInfo = this.getBotInfo();
            const message = `🛒 <b>Новый заказ</b>${botInfo}\n\n` +
                `📦 Заказ #${order.id}\n` +
                `👤 Пользователь: ${name} (${username})\n` +
                `📦 Товар: ${order.product_name}\n` +
                `💰 Сумма: ${order.total_price.toLocaleString('ru-RU')} ${currencySymbol}\n` +
                `📍 Город: ${order.city_name}, Район: ${order.district_name}\n` +
                `⏰ Время на оплату: ${paymentTimeMinutes} минут\n` +
                `📅 Дата: ${new Date(order.created_at).toLocaleString('ru-RU')}\n\n` +
                `📊 Статус: <b>Ожидает оплаты</b>`;

            await this.sendToChannel(message);
        } catch (error) {
            console.error('[NotificationService] Ошибка при отправке уведомления о заказе:', error);
        }
    }

    /**
     * Уведомление о выборе способа оплаты
     */
    async notifyPaymentMethodSelected(orderId, paymentMethodName) {
        try {
            const order = await orderService.getById(orderId);
            if (!order) return;

            const user = await userService.getByChatId(order.user_chat_id);
            const username = user?.username ? `@${user.username}` : `ID: ${order.user_chat_id}`;
            const name = user?.first_name || 'Неизвестно';

            const currencySymbol = await settingsService.getCurrencySymbol();
            const botInfo = this.getBotInfo();
            const message = `💳 <b>Выбран способ оплаты</b>${botInfo}\n\n` +
                `📦 Заказ #${order.id}\n` +
                `👤 Пользователь: ${name} (${username})\n` +
                `💳 Способ оплаты: ${paymentMethodName}\n` +
                `💰 Сумма: ${order.total_price.toLocaleString('ru-RU')} ${currencySymbol}\n\n` +
                `📊 Статус: <b>Переход к оплате</b>`;

            await this.sendToChannel(message);
        } catch (error) {
            console.error('[NotificationService] Ошибка при отправке уведомления о способе оплаты:', error);
        }
    }

    /**
     * Уведомление о пополнении баланса
     */
    async notifyTopup(userId, amount, paymentMethodName) {
        try {
            const user = await userService.getByChatId(userId);
            if (!user) return;

            const username = user.username ? `@${user.username}` : `ID: ${userId}`;
            const name = user.first_name || 'Неизвестно';

            const currencySymbol = await settingsService.getCurrencySymbol();
            const botInfo = this.getBotInfo();
            const message = `💰 <b>Пополнение баланса</b>${botInfo}\n\n` +
                `👤 Пользователь: ${name} (${username})\n` +
                `💳 Способ: ${paymentMethodName}\n` +
                `💰 Сумма: ${amount.toLocaleString('ru-RU')} ${currencySymbol}\n` +
                `📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
                `📊 Статус: <b>Ожидает оплаты</b>`;

            await this.sendToChannel(message);
        } catch (error) {
            console.error('[NotificationService] Ошибка при отправке уведомления о пополнении:', error);
        }
    }

    /**
     * Уведомление о выборе реквизита для пополнения баланса
     */
    async notifyTopupRequest(userId, paymentMethodName) {
        try {
            const user = await userService.getByChatId(userId);
            if (!user) return;

            const username = user.username ? `@${user.username}` : `ID: ${userId}`;
            const name = user.first_name || 'Неизвестно';

            const botInfo = this.getBotInfo();
            const message = `💰 <b>Пополнение баланса</b>${botInfo}\n\n` +
                `👤 Пользователь: ${name} (${username})\n` +
                `💳 Способ: ${paymentMethodName}\n` +
                `📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
                `📊 Статус: <b>Ожидает оплаты</b>`;

            await this.sendToChannel(message);
        } catch (error) {
            console.error('[NotificationService] Ошибка при отправке уведомления о запросе пополнения:', error);
        }
    }
}
