import { database } from '../database/db.js';

export class UserService {
  /**
   * Сохраняет или обновляет информацию о пользователе
   */
  async saveOrUpdate(chatId, userData = {}) {
    const existing = await database.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
    
    if (existing) {
      // Обновляем время последней активности
      await database.run(
        'UPDATE users SET last_active = CURRENT_TIMESTAMP, username = COALESCE(?, username), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name) WHERE chat_id = ?',
        [userData.username || null, userData.first_name || null, userData.last_name || null, chatId]
      );
      return existing;
    } else {
      // Создаем нового пользователя
      const result = await database.run(
        'INSERT INTO users (chat_id, username, first_name, last_name) VALUES (?, ?, ?, ?)',
        [chatId, userData.username || null, userData.first_name || null, userData.last_name || null]
      );
      return { id: result.lastID, chat_id: chatId, ...userData };
    }
  }

  /**
   * Получает всех пользователей для рассылки
   */
  async getAllUsers() {
    return await database.all('SELECT chat_id FROM users ORDER BY last_active DESC');
  }

  /**
   * Получает количество пользователей
   */
  async getUserCount() {
    const result = await database.get('SELECT COUNT(*) as count FROM users');
    return result?.count || 0;
  }

  /**
   * Получает пользователя по chat_id
   */
  async getByChatId(chatId) {
    return await database.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
  }

  /**
   * Уменьшает количество попыток пользователя
   */
  async decreaseUnpaidAttempts(chatId) {
    const user = await this.getByChatId(chatId);
    if (!user) {
      await this.saveOrUpdate(chatId);
    }
    const currentAttempts = (user?.unpaid_attempts || 10) - 1;
    await database.run(
      'UPDATE users SET unpaid_attempts = ? WHERE chat_id = ?',
      [Math.max(0, currentAttempts), chatId]
    );
    return Math.max(0, currentAttempts);
  }

  /**
   * Получает количество оставшихся попыток
   */
  async getUnpaidAttempts(chatId) {
    const user = await this.getByChatId(chatId);
    return user?.unpaid_attempts || 10;
  }
}

export const userService = new UserService();

