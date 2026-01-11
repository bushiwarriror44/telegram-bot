import { database } from '../database/db.js';

/**
 * Получает заказы пользователя
 * @param {number} chatId - ID чата пользователя
 * @param {number} limit - Максимальное количество заказов (по умолчанию 20)
 * @returns {Promise<Array>} Массив заказов
 */
export async function getOrdersByUser(chatId, limit = 20) {
    try {
        return await database.all(
            'SELECT * FROM orders WHERE user_chat_id = ? ORDER BY created_at DESC LIMIT ?',
            [chatId, limit]
        );
    } catch (error) {
        console.error('[DataHelpers] Ошибка при получении заказов:', error);
        return [];
    }
}

/**
 * Получает пополнения пользователя
 * @param {number} chatId - ID чата пользователя
 * @param {number} limit - Максимальное количество пополнений (по умолчанию 20)
 * @returns {Promise<Array>} Массив пополнений
 */
export async function getTopupsByUser(chatId, limit = 20) {
    try {
        console.log('[DataHelpers] Запрос пополнений для пользователя:', chatId);
        const topups = await database.all(
            'SELECT * FROM topups WHERE user_chat_id = ? ORDER BY created_at DESC LIMIT ?',
            [chatId, limit]
        );
        console.log('[DataHelpers] Получено пополнений:', topups.length);
        return topups;
    } catch (error) {
        console.error('[DataHelpers] Ошибка при получении истории пополнений:', error);
        console.error('[DataHelpers] Stack trace:', error.stack);
        return [];
    }
}
