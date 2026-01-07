import { database } from '../database/db.js';

export class SupportService {
  /**
   * Сохраняет сообщение от пользователя
   */
  async saveUserMessage(userChatId, messageText) {
    const result = await database.run(
      'INSERT INTO support_messages (user_chat_id, message_text, is_from_admin) VALUES (?, ?, 0)',
      [userChatId, messageText]
    );
    return result.lastID;
  }

  /**
   * Сохраняет ответ администратора
   */
  async saveAdminMessage(userChatId, adminChatId, messageText) {
    const result = await database.run(
      'INSERT INTO support_messages (user_chat_id, message_text, is_from_admin, admin_chat_id) VALUES (?, ?, 1, ?)',
      [userChatId, messageText, adminChatId]
    );
    return result.lastID;
  }

  /**
   * Получает все сообщения переписки с пользователем
   */
  async getConversation(userChatId) {
    return await database.all(
      'SELECT * FROM support_messages WHERE user_chat_id = ? ORDER BY created_at ASC',
      [userChatId]
    );
  }

  /**
   * Получает список пользователей, которые писали в поддержку (с последним сообщением)
   */
  async getUsersWithMessages(limit = null) {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    return await database.all(`
      SELECT DISTINCT 
        u.chat_id,
        u.username,
        u.first_name,
        u.last_name,
        (SELECT message_text FROM support_messages 
         WHERE user_chat_id = u.chat_id 
         ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM support_messages 
         WHERE user_chat_id = u.chat_id 
         ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM support_messages 
         WHERE user_chat_id = u.chat_id AND is_from_admin = 0) as unread_count
      FROM users u
      INNER JOIN support_messages sm ON u.chat_id = sm.user_chat_id
      GROUP BY u.chat_id
      ORDER BY last_message_time DESC
      ${limitClause}
    `);
  }

  /**
   * Получает количество непрочитанных сообщений от пользователя
   */
  async getUnreadCount(userChatId) {
    const result = await database.get(
      `SELECT COUNT(*) as count FROM support_messages 
       WHERE user_chat_id = ? AND is_from_admin = 0 
       AND created_at > (SELECT COALESCE(MAX(created_at), '1970-01-01') 
                         FROM support_messages 
                         WHERE user_chat_id = ? AND is_from_admin = 1)`,
      [userChatId, userChatId]
    );
    return result?.count || 0;
  }

  /**
   * Получает информацию о пользователе по chat_id
   */
  async getUserInfo(userChatId) {
    return await database.get('SELECT * FROM users WHERE chat_id = ?', [userChatId]);
  }
}

export const supportService = new SupportService();

