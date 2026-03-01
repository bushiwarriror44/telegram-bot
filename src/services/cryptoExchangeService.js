/**
 * Сервис для конвертации тенге в криптовалюту
 * Использует CoinGecko API (курс в USD) и open.er-api.com (USD→KZT)
 */

const USD_TO_KZT_API_URL = 'https://open.er-api.com/v6/latest/USD';

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
     * Конвертирует тенге в криптовалюту
     * @param {number} tenge - Сумма в тенге
     * @param {string} cryptoNetwork - Сеть криптовалюты (BTC, LTC, ETH, USDT, TRC20)
     * @returns {Promise<{amount: number, rate: number, error: string|null}>}
     */
    async convertTengeToCrypto(tenge, cryptoNetwork) {
        try {
            const cryptoId = this.cryptoIdMap[cryptoNetwork.toUpperCase()];

            if (!cryptoId) {
                return {
                    amount: 0,
                    rate: 0,
                    error: `Неподдерживаемая криптовалюта: ${cryptoNetwork}`
                };
            }

            // Курс криптовалюты в USD через CoinGecko API
            const coinResponse = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd`
            );

            if (!coinResponse.ok) {
                throw new Error(`CoinGecko API error: ${coinResponse.status}`);
            }

            const coinData = await coinResponse.json();
            const rateUsd = coinData[cryptoId]?.usd;

            if (!rateUsd || rateUsd === 0) {
                return {
                    amount: 0,
                    rate: 0,
                    error: 'Не удалось получить курс криптовалюты'
                };
            }

            // Курс USD → KZT
            const kztResponse = await fetch(USD_TO_KZT_API_URL);
            if (!kztResponse.ok) {
                return {
                    amount: 0,
                    rate: 0,
                    error: 'Не удалось получить курс USD/KZT'
                };
            }
            const kztData = await kztResponse.json();
            const usdToKzt = kztData?.rates?.KZT;
            if (!usdToKzt || usdToKzt === 0) {
                return {
                    amount: 0,
                    rate: 0,
                    error: 'Не удалось получить курс USD/KZT'
                };
            }

            const rateKzt = rateUsd * usdToKzt;
            const cryptoAmount = tenge / rateKzt;

            return {
                amount: cryptoAmount,
                rate: rateKzt,
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
