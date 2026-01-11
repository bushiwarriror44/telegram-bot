import { database } from '../database/db.js';
import { cardAccountService } from './cardAccountService.js';
import crypto from 'crypto';

export class PaymentService {
    async getAllMethods(includeDisabled = false) {
        // Получаем криптовалютные методы оплаты
        const query = includeDisabled
            ? "SELECT * FROM payment_methods WHERE type = 'crypto' ORDER BY name"
            : "SELECT * FROM payment_methods WHERE type = 'crypto' AND enabled = 1 ORDER BY name";
        const cryptoMethods = await database.all(query);
        
        // Получаем все активные карточные счета и добавляем их как отдельные методы оплаты
        const cardAccounts = await cardAccountService.getAll(!includeDisabled);
        
        // Преобразуем карточные счета в формат методов оплаты
        const cardMethods = cardAccounts.map(account => ({
            id: `card_${account.id}`, // Используем префикс для идентификации
            name: account.name,
            type: 'card',
            network: null,
            enabled: account.enabled ? 1 : 0,
            card_account_id: account.id, // Сохраняем ID карточного счета
            account_number: account.account_number // Сохраняем номер счета для удобства
        }));
        
        // Объединяем криптовалютные методы и карточные счета
        return [...cryptoMethods, ...cardMethods].sort((a, b) => a.name.localeCompare(b.name));
    }

    async getMethodById(id) {
        // Если это карточный счет (префикс card_), получаем его из card_accounts
        if (typeof id === 'string' && id.startsWith('card_')) {
            const cardAccountId = parseInt(id.replace('card_', ''));
            const cardAccount = await cardAccountService.getById(cardAccountId);
            if (cardAccount) {
                return {
                    id: `card_${cardAccount.id}`,
                    name: cardAccount.name,
                    type: 'card',
                    network: null,
                    enabled: cardAccount.enabled ? 1 : 0,
                    card_account_id: cardAccount.id,
                    account_number: cardAccount.account_number
                };
            }
            return null;
        }
        // Иначе получаем из payment_methods
        return await database.get('SELECT * FROM payment_methods WHERE id = ?', [id]);
    }

    async getAddressForMethod(methodId) {
        const addresses = await database.all(
            'SELECT * FROM payment_addresses WHERE payment_method_id = ? ORDER BY created_at DESC LIMIT 1',
            [methodId]
        );
        return addresses[0] || null;
    }

    async getPaymentAddress(methodId) {
        const address = await this.getAddressForMethod(methodId);
        return address ? address.address : null;
    }

    async getCryptoMethods() {
        return await database.all(
            "SELECT * FROM payment_methods WHERE type = 'crypto' AND enabled = 1 ORDER BY name"
        );
    }

    async getCardMethods() {
        return await database.all(
            "SELECT * FROM payment_methods WHERE type = 'card' AND enabled = 1 ORDER BY name"
        );
    }

    async createMethod(name, network, type = 'crypto') {
        const result = await database.run(
            'INSERT INTO payment_methods (name, network, type) VALUES (?, ?, ?)',
            [name, network, type]
        );
        const methodId = result.lastID;

        // Генерируем случайный адрес только для криптовалют
        if (type === 'crypto') {
            const address = this.generateMockAddress(network);
            await this.setAddressForMethod(methodId, address);
        }

        return await this.getMethodById(methodId);
    }

    async setAddressForMethod(methodId, address) {
        await database.run(
            'INSERT INTO payment_addresses (payment_method_id, address) VALUES (?, ?)',
            [methodId, address]
        );
    }

    async updateMethodAddress(methodId, address) {
        await database.run(
            'INSERT INTO payment_addresses (payment_method_id, address) VALUES (?, ?)',
            [methodId, address]
        );
    }

    async deleteMethod(id) {
        await database.run('DELETE FROM payment_methods WHERE id = ?', [id]);
    }

    async enableMethod(id, enabled) {
        await database.run(
            'UPDATE payment_methods SET enabled = ? WHERE id = ?',
            [enabled ? 1 : 0, id]
        );
        return await this.getMethodById(id);
    }

    generateMockAddress(network) {
        // Генерация моковых адресов для разных сетей
        const prefixMap = {
            'BTC': '1',
            'LTC': 'L',
            'ETH': '0x',
            'TRC': 'T',
            'TRC20': 'T',
            'USDT': '0x'
        };

        const prefix = prefixMap[network] || '';
        const randomBytes = crypto.randomBytes(20).toString('hex');

        if (network === 'BTC') {
            return prefix + randomBytes.substring(0, 33);
        } else if (network === 'LTC') {
            return prefix + randomBytes.substring(0, 33);
        } else if (network === 'TRC' || network === 'TRC20') {
            return prefix + randomBytes.substring(0, 33).toUpperCase();
        } else {
            return prefix + randomBytes;
        }
    }
}

export const paymentService = new PaymentService();

