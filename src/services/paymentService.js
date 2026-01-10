import { database } from '../database/db.js';
import crypto from 'crypto';

export class PaymentService {
    async getAllMethods(includeDisabled = false) {
        const query = includeDisabled
            ? 'SELECT * FROM payment_methods ORDER BY name'
            : 'SELECT * FROM payment_methods WHERE enabled = 1 ORDER BY name';
        return await database.all(query);
    }

    async getMethodById(id) {
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
            'ETH': '0x',
            'TRC': 'T',
            'USDT': '0x'
        };

        const prefix = prefixMap[network] || '';
        const randomBytes = crypto.randomBytes(20).toString('hex');

        if (network === 'BTC') {
            return prefix + randomBytes.substring(0, 33);
        } else if (network === 'TRC') {
            return prefix + randomBytes.substring(0, 33).toUpperCase();
        } else {
            return prefix + randomBytes;
        }
    }
}

export const paymentService = new PaymentService();

