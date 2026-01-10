import { database } from '../database/db.js';
import crypto from 'crypto';

export class ReferralService {
    /**
     * Создает реферальную связь
     */
    async createReferral(referrerChatId, referredChatId) {
        // Проверяем, не является ли пользователь сам себе рефералом
        if (referrerChatId === referredChatId) {
            return null;
        }

        // Проверяем, не зарегистрирован ли уже этот пользователь как реферал
        const existing = await database.get(
            'SELECT * FROM referrals WHERE referred_chat_id = ?',
            [referredChatId]
        );
        if (existing) {
            return existing;
        }

        const result = await database.run(
            'INSERT INTO referrals (referrer_chat_id, referred_chat_id) VALUES (?, ?)',
            [referrerChatId, referredChatId]
        );
        return await this.getReferralById(result.lastID);
    }

    /**
     * Получает реферала по ID
     */
    async getReferralById(id) {
        return await database.get('SELECT * FROM referrals WHERE id = ?', [id]);
    }

    /**
     * Получает всех рефералов пользователя
     */
    async getReferralsByReferrer(referrerChatId) {
        return await database.all(
            `SELECT r.*, u.username, u.first_name, u.last_name 
             FROM referrals r
             LEFT JOIN users u ON u.chat_id = r.referred_chat_id
             WHERE r.referrer_chat_id = ?
             ORDER BY r.created_at DESC`,
            [referrerChatId]
        );
    }

    /**
     * Получает количество рефералов пользователя
     */
    async getReferralCount(referrerChatId) {
        const result = await database.get(
            'SELECT COUNT(*) as count FROM referrals WHERE referrer_chat_id = ?',
            [referrerChatId]
        );
        return result?.count || 0;
    }

    /**
     * Получает реферера пользователя
     */
    async getReferrer(referredChatId) {
        return await database.get(
            'SELECT * FROM referrals WHERE referred_chat_id = ?',
            [referredChatId]
        );
    }

    /**
     * Генерирует реферальный код для пользователя
     */
    generateReferralCode(chatId) {
        // Используем chat_id для генерации уникального кода
        const hash = crypto.createHash('md5').update(String(chatId)).digest('hex');
        return hash.substring(0, 8).toUpperCase();
    }

    /**
     * Получает или создает реферальный код пользователя
     */
    async getOrCreateReferralCode(chatId) {
        const code = await database.get(
            'SELECT * FROM user_referral_codes WHERE user_chat_id = ?',
            [chatId]
        );
        
        if (code) {
            return code.code;
        }

        // Генерируем новый код
        const referralCode = this.generateReferralCode(chatId);
        await database.run(
            'INSERT INTO user_referral_codes (user_chat_id, code) VALUES (?, ?)',
            [chatId, referralCode]
        );
        return referralCode;
    }

    /**
     * Получает chat_id по реферальному коду
     */
    async getChatIdByCode(code) {
        const result = await database.get(
            'SELECT user_chat_id FROM user_referral_codes WHERE code = ?',
            [code]
        );
        return result?.user_chat_id || null;
    }

    /**
     * Получает количество покупок рефералов пользователя
     */
    async getReferralPurchasesCount(referrerChatId) {
        const result = await database.get(
            `SELECT COUNT(*) as count 
             FROM orders o
             INNER JOIN referrals r ON r.referred_chat_id = o.user_chat_id
             WHERE r.referrer_chat_id = ? AND o.status = 'completed'`,
            [referrerChatId]
        );
        return result?.count || 0;
    }

    /**
     * Получает общую сумму покупок рефералов
     */
    async getReferralPurchasesTotal(referrerChatId) {
        const result = await database.get(
            `SELECT SUM(o.total_price) as total 
             FROM orders o
             INNER JOIN referrals r ON r.referred_chat_id = o.user_chat_id
             WHERE r.referrer_chat_id = ? AND o.status = 'completed'`,
            [referrerChatId]
        );
        return result?.total || 0;
    }

    /**
     * Начисляет кешбек рефереру при покупке реферала
     */
    async addCashbackToReferrer(referredChatId, orderAmount, cashbackPercent) {
        const referral = await this.getReferrer(referredChatId);
        if (!referral) {
            return null;
        }

        const cashbackAmount = (orderAmount * cashbackPercent) / 100;
        
        // Обновляем баланс реферера
        await database.run(
            'UPDATE users SET balance = balance + ? WHERE chat_id = ?',
            [cashbackAmount, referral.referrer_chat_id]
        );

        return {
            referrerChatId: referral.referrer_chat_id,
            cashbackAmount: cashbackAmount
        };
    }
}

export const referralService = new ReferralService();
