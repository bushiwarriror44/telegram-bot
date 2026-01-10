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

  /**
   * Получает иконку для городов
   */
  async getCityIcon() {
    return await this.get('city_icon', '📍');
  }

  /**
   * Устанавливает иконку для городов
   */
  async setCityIcon(icon) {
    return await this.set('city_icon', icon);
  }

  /**
   * Получает процент скидки за реферала
   */
  async getReferralDiscountPercent() {
    return parseFloat(await this.get('referral_discount_percent', '1.5'));
  }

  /**
   * Устанавливает процент скидки за реферала
   */
  async setReferralDiscountPercent(percent) {
    return await this.set('referral_discount_percent', percent.toString());
  }

  /**
   * Получает максимальный процент скидки
   */
  async getMaxReferralDiscountPercent() {
    return parseFloat(await this.get('max_referral_discount_percent', '8'));
  }

  /**
   * Устанавливает максимальный процент скидки
   */
  async setMaxReferralDiscountPercent(percent) {
    return await this.set('max_referral_discount_percent', percent.toString());
  }

  /**
   * Получает процент кешбека при покупке реферала
   */
  async getReferralCashbackPercent() {
    return parseFloat(await this.get('referral_cashback_percent', '5'));
  }

  /**
   * Устанавливает процент кешбека при покупке реферала
   */
  async setReferralCashbackPercent(percent) {
    return await this.set('referral_cashback_percent', percent.toString());
  }

  /**
   * Получает время блокировки в часах за неоплаченные заказы
   */
  async getBlockTimeHours() {
    return parseFloat(await this.get('block_time_hours', '12'));
  }

  /**
   * Устанавливает время блокировки в часах за неоплаченные заказы
   */
  async setBlockTimeHours(hours) {
    return await this.set('block_time_hours', hours.toString());
  }
}

export const settingsService = new SettingsService();

