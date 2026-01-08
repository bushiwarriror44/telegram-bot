import { database } from '../database/db.js';

export class SettingsService {
  /**
   * Получает значение настройки по ключу
   */
  async get(key, defaultValue = null) {
    const setting = await database.get('SELECT * FROM settings WHERE key = ?', [key]);
    return setting ? setting.value : defaultValue;
  }

  /**
   * Устанавливает значение настройки
   */
  async set(key, value) {
    const existing = await database.get('SELECT * FROM settings WHERE key = ?', [key]);
    
    if (existing) {
      await database.run(
        'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
        [value, key]
      );
    } else {
      await database.run(
        'INSERT INTO settings (key, value) VALUES (?, ?)',
        [key, value]
      );
    }
    
    return await this.get(key);
  }

  /**
   * Получает приветственное сообщение
   */
  async getWelcomeMessage() {
    return await this.get('welcome_message', 'Добро пожаловать!');
  }

  /**
   * Устанавливает приветственное сообщение
   */
  async setWelcomeMessage(message) {
    return await this.set('welcome_message', message);
  }
}

export const settingsService = new SettingsService();

