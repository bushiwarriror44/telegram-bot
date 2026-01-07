import { database } from '../database/db.js';

export class CardAccountService {
  /**
   * Получает все активные карточные счета
   */
  async getAll(enabledOnly = true) {
    const query = enabledOnly
      ? 'SELECT * FROM card_accounts WHERE enabled = 1 ORDER BY name'
      : 'SELECT * FROM card_accounts ORDER BY name';
    return await database.all(query);
  }

  /**
   * Получает случайный активный карточный счет
   */
  async getRandom() {
    const accounts = await database.all(
      'SELECT * FROM card_accounts WHERE enabled = 1 ORDER BY RANDOM() LIMIT 1'
    );
    return accounts[0] || null;
  }

  /**
   * Получает карточный счет по ID
   */
  async getById(id) {
    return await database.get('SELECT * FROM card_accounts WHERE id = ?', [id]);
  }

  /**
   * Создает новый карточный счет
   */
  async create(name, accountNumber) {
    const result = await database.run(
      'INSERT INTO card_accounts (name, account_number) VALUES (?, ?)',
      [name, accountNumber]
    );
    return await this.getById(result.lastID);
  }

  /**
   * Удаляет карточный счет
   */
  async delete(id) {
    await database.run('DELETE FROM card_accounts WHERE id = ?', [id]);
  }

  /**
   * Включает/выключает карточный счет
   */
  async setEnabled(id, enabled) {
    await database.run(
      'UPDATE card_accounts SET enabled = ? WHERE id = ?',
      [enabled ? 1 : 0, id]
    );
    return await this.getById(id);
  }

  /**
   * Обновляет данные карточного счета
   */
  async update(id, name, accountNumber) {
    await database.run(
      'UPDATE card_accounts SET name = ?, account_number = ? WHERE id = ?',
      [name, accountNumber, id]
    );
    return await this.getById(id);
  }
}

export const cardAccountService = new CardAccountService();

