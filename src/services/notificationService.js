import { settingsService } from './settingsService.js';
import { userService } from './userService.js';
import { orderService } from './orderService.js';
import { formatPackaging } from '../utils/packagingHelper.js';

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
            console.log('[NotificationService] sendToChannel: Начало отправки уведомления');
            console.log('[NotificationService] sendToChannel: Bot username:', this.botUsername);
            console.log('[NotificationService] sendToChannel: Bot instance:', this.bot ? 'exists' : 'missing');
            
            const channelId = await settingsService.getNotificationChannelId();
            console.log('[NotificationService] sendToChannel: Channel ID из настроек:', channelId);
            
            if (!channelId) {
                console.log('[NotificationService] sendToChannel: Канал не привязан, уведомление не отправлено');
                return false;
            }

            if (!this.bot || !this.bot.telegram) {
                console.error('[NotificationService] sendToChannel: Bot instance или bot.telegram отсутствует!');
                return false;
            }

            console.log('[NotificationService] sendToChannel: Отправка сообщения в канал', channelId);
            console.log('[NotificationService] sendToChannel: Длина сообщения:', message.length, 'символов');
            
            await this.bot.telegram.sendMessage(channelId, message, {
                parse_mode: parseMode
            });
            
            console.log('[NotificationService] sendToChannel: ✅ Уведомление успешно отправлено в канал:', channelId);
            return true;
        } catch (error) {
            console.error('[NotificationService] sendToChannel: ❌ Ошибка при отправке уведомления в канал:', error);
            console.error('[NotificationService] sendToChannel: Тип ошибки:', error.constructor.name);
            console.error('[NotificationService] sendToChannel: Сообщение об ошибке:', error.message);
            if (error.stack) {
                console.error('[NotificationService] sendToChannel: Stack trace:', error.stack);
            }
            return false;
        }
    }

    /**
     * Уведомление о создании заказа
     */
    async notifyOrderCreated(orderId) {
        try {
            console.log('[NotificationService] notifyOrderCreated: Начало обработки заказа', orderId);
            console.log('[NotificationService] notifyOrderCreated: Bot username:', this.botUsername);
            
            const order = await orderService.getById(orderId);
            if (!order) {
                console.log('[NotificationService] notifyOrderCreated: Заказ не найден, ID:', orderId);
                return;
            }
            console.log('[NotificationService] notifyOrderCreated: Заказ найден:', order.id);

            const user = await userService.getByChatId(order.user_chat_id);
            const username = user?.username ? `@${user.username}` : `ID: ${order.user_chat_id}`;
            const name = user?.first_name || 'Неизвестно';
            console.log('[NotificationService] notifyOrderCreated: Пользователь:', name, username);

            // Получаем время на оплату из настроек
            const paymentTimeMinutes = await settingsService.getPaymentTimeMinutes();
            const currencySymbol = await settingsService.getCurrencySymbol();
            const markupPercent = await settingsService.getGlobalMarkupPercent();
            const amountWithMarkup = Math.round(order.total_price * (1 + (markupPercent > 0 ? markupPercent : 0) / 100));
            const botInfo = this.getBotInfo();
            console.log('[NotificationService] notifyOrderCreated: Bot info:', botInfo || 'empty');
            
            // Формируем строку с фасовкой товара
            const packagingText = order.packaging_value 
                ? ` (${formatPackaging(order.packaging_value, order.packaging_unit || 'g')})` 
                : '';
            
            const message = `🛒 <b>Новый заказ</b>${botInfo}\n\n` +
                `📦 Заказ #95${order.id}73\n` +
                `👤 Пользователь: ${name} (${username})\n` +
                `📦 Товар: ${order.product_name}${packagingText}\n` +
                `💰 Сумма: ${amountWithMarkup.toLocaleString('ru-RU')} ${currencySymbol}\n` +
                `📍 Город: ${order.city_name}, Район: ${order.district_name}\n` +
                `⏰ Время на оплату: ${paymentTimeMinutes} минут\n` +
                `📅 Дата: ${new Date(order.created_at).toLocaleString('ru-RU')}\n\n` +
                `📊 Статус: <b>Ожидает оплаты</b>`;

            console.log('[NotificationService] notifyOrderCreated: Сообщение сформировано, длина:', message.length);
            await this.sendToChannel(message);
        } catch (error) {
            console.error('[NotificationService] notifyOrderCreated: ❌ Ошибка при отправке уведомления о заказе:', error);
            console.error('[NotificationService] notifyOrderCreated: Stack:', error.stack);
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
            const markupPercent = await settingsService.getGlobalMarkupPercent();
            const amountWithMarkup = paymentMethodName === 'Оплата с баланса'
                ? Math.round(order.total_price)
                : Math.round(order.total_price * (1 + (markupPercent > 0 ? markupPercent : 0) / 100));
            const botInfo = this.getBotInfo();
            const message = `💳 <b>Выбран способ оплаты</b>${botInfo}\n\n` +
                `📦 Заказ #95${order.id}73\n` +
                `👤 Пользователь: ${name} (${username})\n` +
                `💳 Способ оплаты: ${paymentMethodName}\n` +
                `💰 Сумма: ${amountWithMarkup.toLocaleString('ru-RU')} ${currencySymbol}\n\n` +
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

    /**
     * Уведомление о сообщении в поддержку
     */
    async notifySupportMessage(userId, messageText, messageType) {
        try {
            console.log('[NotificationService] notifySupportMessage: Начало обработки сообщения поддержки');
            console.log('[NotificationService] notifySupportMessage: User ID:', userId);
            console.log('[NotificationService] notifySupportMessage: Message type:', messageType);
            
            const user = await userService.getByChatId(userId);
            if (!user) {
                console.log('[NotificationService] notifySupportMessage: Пользователь не найден');
                return;
            }

            const username = user.username ? `@${user.username}` : `ID: ${userId}`;
            const name = user.first_name || 'Неизвестно';

            const typeNames = {
                'question': '💬 Вопрос',
                'problem': '🚨 Проблема',
                'payment_problem': '❗ Проблема с платежом'
            };

            const typeName = typeNames[messageType] || '💬 Вопрос';
            const botInfo = this.getBotInfo();
            
            const message = `${typeName} <b>Сообщение в поддержку</b>${botInfo}\n\n` +
                `👤 Пользователь: ${name} (${username})\n` +
                `📝 Сообщение: ${messageText}\n` +
                `📅 Дата: ${new Date().toLocaleString('ru-RU')}`;

            console.log('[NotificationService] notifySupportMessage: Сообщение сформировано, длина:', message.length);
            await this.sendToChannel(message);
        } catch (error) {
            console.error('[NotificationService] notifySupportMessage: ❌ Ошибка при отправке уведомления о сообщении поддержки:', error);
            console.error('[NotificationService] notifySupportMessage: Stack:', error.stack);
        }
    }
}
