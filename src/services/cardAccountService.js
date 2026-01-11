import { database } from '../database/db.js';

export class CardAccountService {
  /**
   * Получает массив карт из JSON строки
   */
  _parseCards(cardsJson) {
    if (!cardsJson) return [];
    try {
      return JSON.parse(cardsJson);
    } catch (error) {
      // Если не JSON, возвращаем как массив с одним элементом (для обратной совместимости)
      return [cardsJson];
    }
  }

  /**
   * Преобразует массив карт в JSON строку
   */
  _stringifyCards(cards) {
    return JSON.stringify(Array.isArray(cards) ? cards : [cards]);
  }

  /**
   * Получает случайную карту из массива карт
   */
  _getRandomCard(cards) {
    if (!cards || cards.length === 0) return null;
    const cardsArray = Array.isArray(cards) ? cards : this._parseCards(cards);
    if (cardsArray.length === 0) return null;
    return cardsArray[Math.floor(Math.random() * cardsArray.length)];
  }

  /**
   * Получает все активные карточные счета с распарсенными картами
   */
  async getAll(enabledOnly = true) {
    const query = enabledOnly
      ? 'SELECT * FROM card_accounts WHERE enabled = 1 ORDER BY name'
      : 'SELECT * FROM card_accounts ORDER BY name';
    const accounts = await database.all(query);
    return accounts.map(account => ({
      ...account,
      cards: this._parseCards(account.cards || account.account_number)
    }));
  }

  /**
   * Получает случайную карту из случайного активного карточного счета
   */
  async getRandom() {
    const accounts = await database.all(
      'SELECT * FROM card_accounts WHERE enabled = 1 ORDER BY RANDOM() LIMIT 1'
    );
    if (accounts.length === 0) return null;
    const account = accounts[0];
    const cards = this._parseCards(account.cards || account.account_number);
    if (cards.length === 0) return null;
    const randomCard = cards[Math.floor(Math.random() * cards.length)];
    return {
      ...account,
      account_number: randomCard,
      cards: cards
    };
  }

  /**
   * Получает случайную карту из конкретного карточного счета по имени
   */
  async getRandomCardByName(name) {
    const account = await this.getByName(name);
    if (!account) return null;
    const cards = this._parseCards(account.cards || account.account_number);
    if (cards.length === 0) return null;
    const randomCard = cards[Math.floor(Math.random() * cards.length)];
    return {
      ...account,
      account_number: randomCard,
      cards: cards
    };
  }

  /**
   * Получает карточный счет по ID со случайной картой
   */
  async getById(id) {
    const account = await database.get('SELECT * FROM card_accounts WHERE id = ?', [id]);
    if (!account) return null;
    const cards = this._parseCards(account.cards || account.account_number);
    const randomCard = this._getRandomCard(cards);
    return {
      ...account,
      account_number: randomCard || account.account_number,
      cards: cards
    };
  }

  /**
   * Получает карточный счет по имени (без случайной карты, для внутреннего использования)
   */
  async getByName(name) {
    const account = await database.get('SELECT * FROM card_accounts WHERE name = ? AND enabled = 1', [name]);
    if (!account) return null;
    return {
      ...account,
      cards: this._parseCards(account.cards || account.account_number)
    };
  }

  /**
   * Создает новый карточный счет
   */
  async create(name, accountNumber) {
    const cards = Array.isArray(accountNumber) ? accountNumber : [accountNumber];
    const result = await database.run(
      'INSERT INTO card_accounts (name, account_number, cards) VALUES (?, ?, ?)',
      [name, accountNumber, this._stringifyCards(cards)]
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
    const cards = Array.isArray(accountNumber) ? accountNumber : [accountNumber];
    await database.run(
      'UPDATE card_accounts SET name = ?, account_number = ?, cards = ? WHERE id = ?',
      [name, accountNumber, this._stringifyCards(cards), id]
    );
    return await this.getById(id);
  }

  /**
   * Обновляет массив карт для карточного счета
   */
  async updateCards(id, cards) {
    const cardsArray = Array.isArray(cards) ? cards : [cards];
    await database.run(
      'UPDATE card_accounts SET cards = ? WHERE id = ?',
      [this._stringifyCards(cardsArray), id]
    );
    return await this.getById(id);
  }

  /**
   * Добавляет карту в массив карт карточного счета
   */
  async addCard(id, cardNumber) {
    const account = await this.getById(id);
    if (!account) throw new Error('Карточный счет не найден');
    const cards = account.cards || [];
    cards.push(cardNumber);
    return await this.updateCards(id, cards);
  }

  /**
   * Удаляет карту из массива карт карточного счета
   */
  async removeCard(id, cardIndex) {
    const account = await this.getById(id);
    if (!account) throw new Error('Карточный счет не найден');
    const cards = account.cards || [];
    if (cardIndex < 0 || cardIndex >= cards.length) {
      throw new Error('Неверный индекс карты');
    }
    cards.splice(cardIndex, 1);
    if (cards.length === 0) {
      throw new Error('Нельзя удалить последнюю карту');
    }
    return await this.updateCards(id, cards);
  }
}

export const cardAccountService = new CardAccountService();

