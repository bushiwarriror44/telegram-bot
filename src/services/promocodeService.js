import { database } from '../database/db.js';

export class PromocodeService {
    /**
     * Создает новый промокод
     */
    async create(code, discountPercent, adminId = null, expiresAt = null) {
        const result = await database.run(
            'INSERT INTO promocodes (code, discount_percent, created_by_admin_id, expires_at) VALUES (?, ?, ?, ?)',
            [code.toUpperCase(), discountPercent, adminId, expiresAt]
        );
        return { id: result.lastID, code: code.toUpperCase(), discount_percent: discountPercent };
    }

    /**
     * Получает все промокоды (или только активные)
     */
    async getAll(activeOnly = false) {
        const query = activeOnly
            ? 'SELECT * FROM promocodes WHERE enabled = 1 ORDER BY created_at DESC'
            : 'SELECT * FROM promocodes ORDER BY created_at DESC';
        return await database.all(query);
    }

    /**
     * Получает промокод по ID
     */
    async getById(id) {
        return await database.get('SELECT * FROM promocodes WHERE id = ?', [id]);
    }

    /**
     * Получает промокод по коду
     */
    async getByCode(code) {
        return await database.get('SELECT * FROM promocodes WHERE code = ?', [code.toUpperCase()]);
    }

    /**
     * Удаляет промокод
     */
    async delete(id) {
        await database.run('DELETE FROM promocodes WHERE id = ?', [id]);
    }

    /**
     * Включает/выключает промокод
     */
    async enable(id, enabled = true) {
        await database.run('UPDATE promocodes SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
        return await this.getById(id);
    }

    /**
     * Выдает промокод пользователю
     */
    async assignToUser(userChatId, promocodeId) {
        // Проверяем, не выдан ли уже этот промокод пользователю
        const existing = await database.get(
            'SELECT * FROM user_promocodes WHERE user_chat_id = ? AND promocode_id = ?',
            [userChatId, promocodeId]
        );

        if (existing) {
            return existing; // Уже выдан
        }

        const result = await database.run(
            'INSERT INTO user_promocodes (user_chat_id, promocode_id) VALUES (?, ?)',
            [userChatId, promocodeId]
        );
        return { id: result.lastID, user_chat_id: userChatId, promocode_id: promocodeId, used: 0 };
    }

    /**
     * Выдает промокод всем пользователям
     */
    async assignToAllUsers(promocodeId) {
        const users = await database.all('SELECT chat_id FROM users');
        const results = [];

        for (const user of users) {
            const existing = await database.get(
                'SELECT * FROM user_promocodes WHERE user_chat_id = ? AND promocode_id = ?',
                [user.chat_id, promocodeId]
            );

            if (!existing) {
                const result = await database.run(
                    'INSERT INTO user_promocodes (user_chat_id, promocode_id) VALUES (?, ?)',
                    [user.chat_id, promocodeId]
                );
                results.push({ user_chat_id: user.chat_id, assigned: true });
            } else {
                results.push({ user_chat_id: user.chat_id, assigned: false, reason: 'already_assigned' });
            }
        }

        return results;
    }

    /**
     * Получает промокоды пользователя (неиспользованные)
     */
    async getUserPromocodes(userChatId, unusedOnly = true) {
        const query = unusedOnly
            ? `SELECT p.*, up.id as user_promocode_id, up.used, up.used_at
         FROM promocodes p
         INNER JOIN user_promocodes up ON p.id = up.promocode_id
         WHERE up.user_chat_id = ? AND up.used = 0 AND p.enabled = 1
         ORDER BY up.created_at DESC`
            : `SELECT p.*, up.id as user_promocode_id, up.used, up.used_at
         FROM promocodes p
         INNER JOIN user_promocodes up ON p.id = up.promocode_id
         WHERE up.user_chat_id = ?
         ORDER BY up.created_at DESC`;
        return await database.all(query, [userChatId]);
    }

    /**
     * Проверяет, валиден ли промокод для пользователя
     */
    async validatePromocodeForUser(userChatId, code) {
        const promocode = await this.getByCode(code);

        if (!promocode || promocode.enabled !== 1) {
            return { valid: false, reason: 'Промокод не найден или неактивен' };
        }

        // Проверяем срок действия
        if (promocode.expires_at) {
            const expiresAt = new Date(promocode.expires_at);
            if (expiresAt < new Date()) {
                return { valid: false, reason: 'Промокод истек' };
            }
        }

        // Проверяем, выдан ли промокод пользователю
        const userPromocode = await database.get(
            'SELECT * FROM user_promocodes WHERE user_chat_id = ? AND promocode_id = ?',
            [userChatId, promocode.id]
        );

        if (!userPromocode) {
            return { valid: false, reason: 'Промокод не выдан вам' };
        }

        // Проверяем, использован ли промокод
        if (userPromocode.used === 1) {
            return { valid: false, reason: 'Промокод уже использован' };
        }

        return { valid: true, promocode, userPromocode };
    }

    /**
     * Помечает промокод как использованный
     */
    async markAsUsed(userChatId, promocodeId) {
        await database.run(
            'UPDATE user_promocodes SET used = 1, used_at = CURRENT_TIMESTAMP WHERE user_chat_id = ? AND promocode_id = ?',
            [userChatId, promocodeId]
        );
    }

    /**
     * Получает количество активных промокодов
     */
    async getActiveCount() {
        const result = await database.get('SELECT COUNT(*) as count FROM promocodes WHERE enabled = 1');
        return result?.count || 0;
    }
}

export const promocodeService = new PromocodeService();
