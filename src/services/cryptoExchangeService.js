/**
 * Сервис для конвертации рублей в криптовалюту
 * Использует CoinGecko API (бесплатный, без API ключа)
 */

export class CryptoExchangeService {
    // Маппинг названий криптовалют для CoinGecko API
    cryptoIdMap = {
        'BTC': 'bitcoin',
        'LTC': 'litecoin',
        'ETH': 'ethereum',
        'USDT': 'tether',
        'TRC20': 'tether', // USDT TRC20 использует тот же ID
        'TRC': 'tether',
        'USDT TRC20': 'tether' // Для случая, когда название метода содержит "USDT TRC20"
    };

    /**
     * Конвертирует рубли в криптовалюту
     * @param {number} rubles - Сумма в рублях
     * @param {string} cryptoNetwork - Сеть криптовалюты (BTC, LTC, ETH, USDT, TRC20)
     * @returns {Promise<{amount: number, rate: number, error: string|null}>}
     */
    async convertRublesToCrypto(rubles, cryptoNetwork) {
        try {
            const cryptoId = this.cryptoIdMap[cryptoNetwork.toUpperCase()];
            
            if (!cryptoId) {
                return {
                    amount: 0,
                    rate: 0,
                    error: `Неподдерживаемая криптовалюта: ${cryptoNetwork}`
                };
            }

            // Получаем курс криптовалюты к рублю через CoinGecko API
            const response = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=rub`
            );

            if (!response.ok) {
                throw new Error(`CoinGecko API error: ${response.status}`);
            }

            const data = await response.json();
            const rate = data[cryptoId]?.rub;

            if (!rate || rate === 0) {
                return {
                    amount: 0,
                    rate: 0,
                    error: 'Не удалось получить курс криптовалюты'
                };
            }

            // Конвертируем рубли в криптовалюту
            const cryptoAmount = rubles / rate;

            return {
                amount: cryptoAmount,
                rate: rate,
                error: null
            };
        } catch (error) {
            console.error('[CryptoExchangeService] Ошибка при конвертации:', error);
            return {
                amount: 0,
                rate: 0,
                error: error.message || 'Ошибка при получении курса'
            };
        }
    }

    /**
     * Получает символ криптовалюты для отображения
     * @param {string} cryptoNetwork - Сеть криптовалюты
     * @returns {string}
     */
    getCryptoSymbol(cryptoNetwork) {
        const symbolMap = {
            'BTC': '₿',
            'LTC': 'Ł',
            'ETH': 'Ξ',
            'USDT': 'USDT',
            'TRC20': 'USDT',
            'TRC': 'USDT'
        };
        return symbolMap[cryptoNetwork.toUpperCase()] || cryptoNetwork.toUpperCase();
    }

    /**
     * Форматирует сумму криптовалюты для отображения
     * @param {number} amount - Сумма в криптовалюте
     * @param {string} cryptoNetwork - Сеть криптовалюты
     * @returns {string}
     */
    formatCryptoAmount(amount, cryptoNetwork) {
        // Для BTC, LTC используем 8 знаков после запятой
        // Для ETH, USDT используем 6 знаков
        const decimals = (cryptoNetwork.toUpperCase() === 'BTC' || cryptoNetwork.toUpperCase() === 'LTC') ? 8 : 6;
        return amount.toFixed(decimals);
    }
}

export const cryptoExchangeService = new CryptoExchangeService();
