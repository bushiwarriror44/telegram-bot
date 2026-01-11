import { orderService } from './orderService.js';
import { userService } from './userService.js';
import { settingsService } from './settingsService.js';
import { database } from '../database/db.js';

export class UnpaidOrderMonitorService {
    constructor(bot) {
        this.bot = bot;
        this.intervalId = null;
        this.checkInterval = 5 * 60 * 1000; // 5 минут
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
            const blockTimeHours = await settingsService.getBlockTimeHours() || 24;

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
                                `🥲 Заявка на пополнение №${lastUnpaidOrder.id} не была вовремя оплачена.\n\n` +
                                `<b>Внимание!</b> Запрещено создавать заявки на пополнение и не оплачивать их. За это Вы будете заблокированы на ${blockTimeHours} часов.\n\n` +
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
                    console.error(`[UnpaidOrderMonitor] Ошибка при проверке пользователя ${chatId}:`, error);
                }
            }

            console.log(`[UnpaidOrderMonitor] Проверка завершена. Обработано предупреждений: ${processedCount}`);
        } catch (error) {
            console.error('[UnpaidOrderMonitor] Критическая ошибка при проверке неоплаченных заказов:', error);
        }
    }
}

export let unpaidOrderMonitorService = null;
