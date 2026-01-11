import { database } from '../database/db.js';

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
                    pk.value AS packaging_value
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
}

export const orderService = new OrderService();
