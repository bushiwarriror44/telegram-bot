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
    // По умолчанию блокируем на 30 минут (0.5 часа)
    return parseFloat(await this.get('block_time_hours', '0.5'));
  }

  /**
   * Устанавливает время блокировки в часах за неоплаченные заказы
   */
  async setBlockTimeHours(hours) {
    return await this.set('block_time_hours', hours.toString());
  }

  /**
   * Получает ID привязанного Telegram-канала
   */
  async getNotificationChannelId() {
    return await this.get('notification_channel_id', null);
  }

  /**
   * Устанавливает ID привязанного Telegram-канала
   */
  async setNotificationChannelId(channelId) {
    return await this.set('notification_channel_id', channelId.toString());
  }

  /**
   * Получает время на оплату в минутах
   */
  async getPaymentTimeMinutes() {
    return parseInt(await this.get('payment_time_minutes', '30'));
  }

  /**
   * Устанавливает время на оплату в минутах
   */
  async setPaymentTimeMinutes(minutes) {
    return await this.set('payment_time_minutes', minutes.toString());
  }

  /**
   * Получает название витрины
   */
  async getStorefrontName() {
    return await this.get('storefront_name', 'Hitpoint');
  }

  /**
   * Устанавливает название витрины
   */
  async setStorefrontName(name) {
    return await this.set('storefront_name', name);
  }

  /**
   * Получает символ валюты
   */
  async getCurrencySymbol() {
    return await this.get('currency_symbol', '₸');
  }

  /**
   * Устанавливает символ валюты
   */
  async setCurrencySymbol(symbol) {
    return await this.set('currency_symbol', symbol);
  }

  /**
   * Получает глобальную наценку (комиссию) в процентах
   * Применяется к итоговой сумме заказа при выдаче реквизитов.
   * Значение хранится как строка, но возвращается как число.
   */
  async getGlobalMarkupPercent() {
    const raw = await this.get('global_markup_percent', '0');
    const num = parseFloat(raw);
    return Number.isNaN(num) ? 0 : num;
  }

  /**
   * Устанавливает глобальную наценку (комиссию) в процентах
   */
  async setGlobalMarkupPercent(percent) {
    const value = typeof percent === 'number' ? percent.toString() : String(percent);
    return await this.set('global_markup_percent', value);
  }

  /**
   * Число в скобках на кнопке «Отзывы» в главном меню (по умолчанию 561)
   */
  async getReviewsDisplayCount() {
    const raw = await this.get('reviews_display_count', '561');
    const n = parseInt(raw, 10);
    return Number.isNaN(n) || n < 0 ? 561 : n;
  }

  async setReviewsDisplayCount(num) {
    const value = Math.max(0, parseInt(String(num), 10) || 561);
    return await this.set('reviews_display_count', value.toString());
  }

  /**
   * Капча при входе: по умолчанию включена (настройка из админки, .env игнорируется)
   */
  async getCaptchaEnabled() {
    const raw = await this.get('captcha_enabled', '1');
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  async setCaptchaEnabled(enabled) {
    return await this.set('captcha_enabled', enabled ? '1' : '0');
  }
}

export const settingsService = new SettingsService();

