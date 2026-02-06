import { database } from '../database/db.js';
import { settingsService } from './settingsService.js';

export class OrderService {
    async create(userChatId, productId, cityId, districtId, price, discount, totalPrice, promocodeId = null) {
        const result = await database.run(
            `INSERT INTO orders (user_chat_id, product_id, city_id, district_id, price, discount, total_price, promocode_id, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [userChatId, productId, cityId, districtId, price, discount, totalPrice, promocodeId]
        );
        return await this.getById(result.lastID);
    }

    async getById(id) {
        return await database.get(
            `SELECT o.*, 
                    p.name AS product_name,
                    p.description AS product_description,
                    pk.value AS packaging_value,
                    pk.unit AS packaging_unit,
                    c.name AS city_name,
                    d.name AS district_name,
                    pm.name AS payment_method_name,
                    pr.code AS promocode_code
             FROM orders o
             LEFT JOIN products p ON p.id = o.product_id
             LEFT JOIN packagings pk ON pk.id = p.packaging_id
             LEFT JOIN cities c ON c.id = o.city_id
             LEFT JOIN districts d ON d.id = o.district_id
             LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
             LEFT JOIN promocodes pr ON pr.id = o.promocode_id
             WHERE o.id = ?`,
            [id]
        );
    }

    async getByUserId(userChatId) {
        return await database.all(
            `SELECT o.*, 
                    p.name AS product_name,
                    pk.value AS packaging_value,
                    pk.unit AS packaging_unit
             FROM orders o
             LEFT JOIN products p ON p.id = o.product_id
             LEFT JOIN packagings pk ON pk.id = p.packaging_id
             WHERE o.user_chat_id = ?
             ORDER BY o.created_at DESC`,
            [userChatId]
        );
    }

    async updatePaymentMethod(orderId, paymentMethodId) {
        await database.run(
            'UPDATE orders SET payment_method_id = ? WHERE id = ?',
            [paymentMethodId, orderId]
        );
        return await this.getById(orderId);
    }

    async updateStatus(orderId, status) {
        await database.run(
            'UPDATE orders SET status = ? WHERE id = ?',
            [status, orderId]
        );
        return await this.getById(orderId);
    }

    /**
     * Получает неоплаченные заказы пользователя старше указанного времени (в минутах)
     * Возвращает только заказы, для которых еще не было отправлено уведомление
     */
    async getUnpaidOrdersOlderThan(userChatId, minutes) {
        return await database.all(
            `SELECT * FROM orders 
             WHERE user_chat_id = ? 
             AND status = 'pending' 
             AND payment_method_id IS NOT NULL
             AND (warning_sent IS NULL OR warning_sent = 0)
             AND datetime(created_at, '+' || ? || ' minutes') < datetime('now')
             ORDER BY created_at DESC`,
            [userChatId, minutes]
        );
    }

    /**
     * Помечает заказ как обработанный (уведомление отправлено)
     */
    async markWarningAsSent(orderId) {
        await database.run(
            'UPDATE orders SET warning_sent = 1 WHERE id = ?',
            [orderId]
        );
        return await this.getById(orderId);
    }

    /**
     * Получает последний неоплаченный заказ пользователя
     */
    async getLastUnpaidOrder(userChatId) {
        return await database.get(
            `SELECT * FROM orders 
             WHERE user_chat_id = ? 
             AND status = 'pending' 
             AND payment_method_id IS NOT NULL
             ORDER BY created_at DESC 
             LIMIT 1`,
            [userChatId]
        );
    }

    /**
     * Получает активный заказ пользователя (pending или paid статус, не старше времени на оплату)
     */
    async getActiveOrder(userChatId) {
        console.log('[OrderService] getActiveOrder: Поиск активного заказа для пользователя', userChatId);

        // Получаем время на оплату из настроек
        const paymentTimeMinutes = await settingsService.getPaymentTimeMinutes() || 30;
        console.log('[OrderService] getActiveOrder: Время на оплату (минут):', paymentTimeMinutes);

        // Получаем заказ со статусом pending или paid
        const result = await database.get(
            `SELECT * FROM orders 
             WHERE user_chat_id = ? 
             AND (status = 'pending' OR status = 'paid')
             ORDER BY created_at DESC 
             LIMIT 1`,
            [userChatId]
        );

        console.log('[OrderService] getActiveOrder: SQL запрос выполнен');
        console.log('[OrderService] getActiveOrder: Результат:', result ? 'Найден заказ' : 'Заказ не найден');

        if (result) {
            console.log('[OrderService] getActiveOrder: Детали найденного заказа:', {
                id: result.id,
                status: result.status,
                user_chat_id: result.user_chat_id,
                created_at: result.created_at,
                product_id: result.product_id
            });

            // Проверяем, не истекло ли время на оплату
            const orderDate = new Date(result.created_at);
            const now = new Date();
            const diffMinutes = (now - orderDate) / (1000 * 60);
            console.log('[OrderService] getActiveOrder: Время с момента создания заказа (минут):', diffMinutes.toFixed(2));
            console.log('[OrderService] getActiveOrder: Лимит времени (минут):', paymentTimeMinutes);

            if (diffMinutes > paymentTimeMinutes) {
                console.log('[OrderService] getActiveOrder: Время на оплату истекло, заказ не считается активным');

                // Автоматически обновляем статус просроченного заказа на 'expired'
                if (result.status === 'pending') {
                    console.log('[OrderService] getActiveOrder: Обновление статуса заказа на expired');
                    await this.updateStatus(result.id, 'expired');
                }

                // Проверяем все заказы пользователя для отладки
                const allOrders = await database.all(
                    `SELECT id, status, created_at FROM orders 
                     WHERE user_chat_id = ? 
                     ORDER BY created_at DESC 
                     LIMIT 10`,
                    [userChatId]
                );
                console.log('[OrderService] getActiveOrder: Все заказы пользователя (последние 10):', allOrders);

                return null; // Заказ просрочен, не считается активным
            } else {
                console.log('[OrderService] getActiveOrder: Заказ еще активен, время не истекло');
            }
        } else {
            // Проверяем все заказы пользователя для отладки
            const allOrders = await database.all(
                `SELECT id, status, created_at FROM orders 
                 WHERE user_chat_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT 10`,
                [userChatId]
            );
            console.log('[OrderService] getActiveOrder: Все заказы пользователя (последние 10):', allOrders);
        }

        return result;
    }

    /**
     * Отменяет заказ
     */
    async cancelOrder(orderId) {
        await database.run(
            'UPDATE orders SET status = ? WHERE id = ?',
            ['cancelled', orderId]
        );
        return await this.getById(orderId);
    }

    /**
     * Получает заказы со статусом expired, для которых еще не было отправлено уведомление
     */
    async getExpiredOrdersWithoutNotification() {
        return await database.all(
            `SELECT * FROM orders 
             WHERE status = 'expired' 
             AND (expired_notification_sent IS NULL OR expired_notification_sent = 0)
             ORDER BY created_at DESC`
        );
    }

    /**
     * Помечает заказ как обработанный (уведомление об истечении отправлено)
     */
    async markExpiredNotificationAsSent(orderId) {
        await database.run(
            'UPDATE orders SET expired_notification_sent = 1 WHERE id = ?',
            [orderId]
        );
        return await this.getById(orderId);
    }
}

export const orderService = new OrderService();
