import { settingsService } from '../services/settingsService.js';

/**
 * Получает символ валюты из настроек
 * @returns {Promise<string>} Символ валюты (по умолчанию ₸)
 */
export async function getCurrencySymbol() {
    try {
        return await settingsService.getCurrencySymbol();
    } catch (error) {
        console.error('[CurrencyHelper] Ошибка при получении символа валюты:', error);
        return '₸'; // Возвращаем тенге по умолчанию при ошибке
    }
}

/**
 * Форматирует значение валюты с символом
 * @param {number} value - Значение для форматирования
 * @param {string} currencySymbol - Символ валюты
 * @returns {string} Отформатированная строка
 */
export function formatCurrency(value, currencySymbol) {
    return `${(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currencySymbol}`;
}

/**
 * Форматирует значение валюты с автоматическим получением символа
 * @param {number} value - Значение для форматирования
 * @returns {Promise<string>} Отформатированная строка
 */
export async function formatCurrencyAuto(value) {
    const currencySymbol = await getCurrencySymbol();
    return formatCurrency(value, currencySymbol);
}
