import { database } from '../database/db.js';

export class StatisticsService {
    /**
     * Получает количество пользователей, которые открыли бота
     */
    async getUserCount() {
        const result = await database.get('SELECT COUNT(*) as count FROM users');
        return result?.count || 0;
    }

    /**
     * Получает общее количество товаров по всем городам
     */
    async getTotalProductsCount() {
        const result = await database.get('SELECT COUNT(*) as count FROM products');
        return result?.count || 0;
    }

    /**
     * Получает общую стоимость всех товаров
     */
    async getTotalProductsValue() {
        const result = await database.get('SELECT SUM(price) as total FROM products');
        return result?.total || 0;
    }

    /**
     * Получает средний чек из всех покупок
     */
    async getAverageOrderValue() {
        const result = await database.get(
            'SELECT AVG(total_price) as average FROM orders WHERE status = ?',
            ['completed']
        );
        return result?.average || 0;
    }

    /**
     * Получает общую сумму продаж за все время
     */
    async getTotalSales() {
        const result = await database.get(
            'SELECT SUM(total_price) as total FROM orders WHERE status = ?',
            ['completed']
        );
        return result?.total || 0;
    }

    /**
     * Получает сумму продаж за текущий месяц
     */
    async getMonthlySales() {
        const result = await database.get(
            `SELECT SUM(total_price) as total FROM orders 
             WHERE status = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
            ['completed']
        );
        return result?.total || 0;
    }

    /**
     * Получает сумму продаж за текущую неделю
     */
    async getWeeklySales() {
        const result = await database.get(
            `SELECT SUM(total_price) as total FROM orders 
             WHERE status = ? AND created_at >= datetime('now', '-7 days')`,
            ['completed']
        );
        return result?.total || 0;
    }

    /**
     * Получает сумму продаж за текущий день
     */
    async getDailySales() {
        const result = await database.get(
            `SELECT SUM(total_price) as total FROM orders 
             WHERE status = ? AND date(created_at) = date('now')`,
            ['completed']
        );
        return result?.total || 0;
    }

    /**
     * Получает самый популярный товар (по количеству просмотров)
     */
    async getMostPopularProduct() {
        const result = await database.get(
            `SELECT 
                p.id,
                p.name,
                pk.value AS packaging_value,
                COUNT(pv.id) AS view_count
             FROM products p
             LEFT JOIN packagings pk ON pk.id = p.packaging_id
             LEFT JOIN product_views pv ON pv.product_id = p.id
             GROUP BY p.id
             ORDER BY view_count DESC, p.name ASC
             LIMIT 1`
        );
        return result || null;
    }

    /**
     * Получает самый непопулярный товар (по количеству просмотров)
     */
    async getLeastPopularProduct() {
        const result = await database.get(
            `SELECT 
                p.id,
                p.name,
                pk.value AS packaging_value,
                COUNT(pv.id) AS view_count
             FROM products p
             LEFT JOIN packagings pk ON pk.id = p.packaging_id
             LEFT JOIN product_views pv ON pv.product_id = p.id
             GROUP BY p.id
             ORDER BY view_count ASC, p.name ASC
             LIMIT 1`
        );
        return result || null;
    }

    /**
     * Записывает просмотр товара
     */
    async recordProductView(productId, userChatId = null) {
        await database.run(
            'INSERT INTO product_views (product_id, user_chat_id) VALUES (?, ?)',
            [productId, userChatId]
        );
    }
}

export const statisticsService = new StatisticsService();
