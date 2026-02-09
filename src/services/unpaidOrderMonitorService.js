import { orderService } from './orderService.js';
import { userService } from './userService.js';
import { settingsService } from './settingsService.js';
import { database } from '../database/db.js';

export class UnpaidOrderMonitorService {
    constructor(bot) {
        this.bot = bot;
        this.intervalId = null;
        this.checkInterval = 2 * 60 * 1000; // 2 минуты — чтобы истечение по 30 мин срабатывало вовремя
    }

    /**
     * Запускает фоновую проверку неоплаченных заказов
     */
    start() {
        console.log('[UnpaidOrderMonitor] Запуск фоновой проверки неоплаченных заказов...');
        console.log('[UnpaidOrderMonitor] Интервал проверки:', this.checkInterval / 1000, 'секунд');

        // Выполняем первую проверку сразу
        this.checkUnpaidOrders();

        // Затем запускаем периодическую проверку
        this.intervalId = setInterval(() => {
            this.checkUnpaidOrders();
        }, this.checkInterval);

        console.log('[UnpaidOrderMonitor] Фоновая проверка запущена');
    }

    /**
     * Останавливает фоновую проверку
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[UnpaidOrderMonitor] Фоновая проверка остановлена');
        }
    }

    /**
     * Проверяет всех пользователей на наличие неоплаченных заказов
     */
    async checkUnpaidOrders() {
        try {
            console.log('[UnpaidOrderMonitor] Начало проверки неоплаченных заказов...');

            // Получаем время на оплату из настроек (по умолчанию 30 минут)
            const paymentTimeMinutes = await settingsService.getPaymentTimeMinutes() || 30;
            const blockTimeHours = await settingsService.getBlockTimeHours() || 0.5;
            const blockTimeMinutes = Math.round(blockTimeHours * 60);

            // Сначала переводим все просроченные pending-заказы в expired (чтобы отмена работала даже без действий пользователя)
            const expiredCount = await orderService.expireOldPendingOrders(paymentTimeMinutes);
            if (expiredCount > 0) {
                console.log(`[UnpaidOrderMonitor] Переведено в expired: ${expiredCount} заказ(ов)`);
            }

            // Получаем всех пользователей
            const allUsers = await userService.getAllUsers();
            console.log('[UnpaidOrderMonitor] Проверка для', allUsers.length, 'пользователей');

            let processedCount = 0;

            for (const user of allUsers) {
                try {
                    const chatId = user.chat_id || user.chatId || user.id;
                    if (!chatId) continue;

                    // Получаем неоплаченные заказы пользователя старше указанного времени
                    const unpaidOrders = await orderService.getUnpaidOrdersOlderThan(
                        chatId,
                        paymentTimeMinutes
                    );

                    if (unpaidOrders.length > 0) {
                        // Берем первый неоплаченный заказ (самый старый из необработанных)
                        // Метод getUnpaidOrdersOlderThan уже возвращает только заказы без уведомлений
                        const lastUnpaidOrder = unpaidOrders[0];

                        // Помечаем заказ как обработанный в БД (чтобы уведомление не отправлялось повторно)
                        await orderService.markWarningAsSent(lastUnpaidOrder.id);

                        // Уменьшаем количество попыток
                        const remainingAttempts = await userService.decreaseUnpaidAttempts(chatId);

                        // Отправляем первое предупреждение
                        try {
                            await this.bot.telegram.sendMessage(
                                chatId,
                                `🥲 Заявка на пополнение  не была вовремя оплачена.\n\n` +
                                `<b>Внимание!</b> Запрещено создавать заявки на пополнение и не оплачивать их. За это Вы будете заблокированы на ${blockTimeMinutes} минут.\n\n` +
                                `У Вас осталось ${remainingAttempts} попытки получения реквизитов.`,
                                { parse_mode: 'HTML' }
                            );

                            // Отправляем второе предупреждение
                            await this.bot.telegram.sendMessage(
                                chatId,
                                '⚠️ Не спамьте заявками на пополнение, иначе вы будете заблокированы в боте!'
                            );

                            processedCount++;
                            console.log(`[UnpaidOrderMonitor] Предупреждение отправлено пользователю ${chatId} (заказ #${lastUnpaidOrder.id})`);
                        } catch (error) {
                            console.error(`[UnpaidOrderMonitor] Ошибка отправки предупреждения пользователю ${chatId}:`, error.message);
                            // Если не удалось отправить, откатываем пометку в БД
                            await database.run('UPDATE orders SET warning_sent = 0 WHERE id = ?', [lastUnpaidOrder.id]);
                        }
                    }
                } catch (error) {
                    const errorChatId = user?.chat_id || user?.chatId || user?.id || 'unknown';
                    console.error(`[UnpaidOrderMonitor] Ошибка при проверке пользователя ${errorChatId}:`, error);
                }
            }

            console.log(`[UnpaidOrderMonitor] Проверка завершена. Обработано предупреждений: ${processedCount}`);

            // Проверяем истекшие заказы (которые стали expired и не оплачены)
            await this.checkExpiredOrders();
        } catch (error) {
            console.error('[UnpaidOrderMonitor] Критическая ошибка при проверке неоплаченных заказов:', error);
        }
    }

    /**
     * Проверяет заказы со статусом expired и отправляет уведомления пользователям
     */
    async checkExpiredOrders() {
        try {
            console.log('[UnpaidOrderMonitor] Начало проверки истекших заказов...');

            // Время блокировки при не оплате (часы)
            const blockTimeHours = await settingsService.getBlockTimeHours() || 0.5;
            const blockTimeMinutes = Math.round(blockTimeHours * 60);

            // Получаем все заказы со статусом expired, для которых еще не было отправлено уведомление
            const expiredOrders = await orderService.getExpiredOrdersWithoutNotification();
            console.log('[UnpaidOrderMonitor] Найдено истекших заказов без уведомлений:', expiredOrders.length);

            let notificationCount = 0;

            for (const order of expiredOrders) {
                try {
                    const chatId = order.user_chat_id;
                    if (!chatId) continue;

                    const orderNumber = await orderService.getOrderNumber(order.id);

                    // Сначала отправляем уведомление, потом помечаем — так сообщение не теряется при временных сбоях
                    try {
                        await this.bot.telegram.sendMessage(
                            chatId,
                            `🥲 Ваш заказ не был вовремя оплачен.\n\n<b>Внимание!</b> Запрещено создавать заказы и не оплачивать их. \n ⚠️ Не спамьте заявками на пополнение, иначе вы будете заблокированы в боте!`,
                            { parse_mode: 'HTML' }
                        );

                        notificationCount++;
                        console.log(`[UnpaidOrderMonitor] Уведомление об истечении заказа отправлено пользователю ${chatId} (заказ #${orderNumber})`);

                        // Помечаем только после успешной отправки
                        await orderService.markExpiredNotificationAsSent(order.id);
                    } catch (error) {
                        const msg = error?.message || '';

                        // Если ошибка постоянная (чат не найден, бот заблокирован и т.п.),
                        // логируем как предупреждение и помечаем уведомление как отправленное,
                        // чтобы не спамить логами бесконечно
                        if (/400: Bad Request: chat not found/i.test(msg) ||
                            /403: Forbidden/i.test(msg) ||
                            /user is deactivated/i.test(msg)) {
                            console.warn(`[UnpaidOrderMonitor] Постоянная ошибка доставки (chat not found/forbidden) для пользователя ${chatId}. Помечаем уведомление как отправленное для заказа #${order.id}.`);
                            try {
                                await orderService.markExpiredNotificationAsSent(order.id);
                            } catch (markError) {
                                console.error('[UnpaidOrderMonitor] Ошибка при пометке уведомления как отправленного:', markError.message);
                            }
                        } else {
                            // Для временных ошибок (ECONNRESET и т.п.) логируем как ошибку
                            // и НЕ помечаем — в следующем цикле повторим отправку
                            console.error(`[UnpaidOrderMonitor] Ошибка отправки уведомления об истечении заказа пользователю ${chatId}:`, msg);
                        }
                    }
                } catch (error) {
                    console.error(`[UnpaidOrderMonitor] Ошибка при обработке истекшего заказа #${order.id}:`, error);
                }
            }

            console.log(`[UnpaidOrderMonitor] Проверка истекших заказов завершена. Отправлено уведомлений: ${notificationCount}`);
        } catch (error) {
            console.error('[UnpaidOrderMonitor] Критическая ошибка при проверке истекших заказов:', error);
        }
    }
}

export let unpaidOrderMonitorService = null;
