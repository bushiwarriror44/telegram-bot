import { settingsService } from '../services/settingsService.js';

/**
 * Возвращает сумму заказа с учетом глобальной наценки (без случайного отклонения).
 * Используется там, где нужна стабильная сумма с комиссией.
 * @param {Object} order - объект заказа из БД (должен содержать total_price)
 */
export async function getOrderAmountWithMarkup(order) {
    const markupPercent = await settingsService.getGlobalMarkupPercent();
    const factor = 1 + (markupPercent > 0 ? markupPercent : 0) / 100;
    return Math.round(order.total_price * factor);
}

/**
 * Возвращает финальную сумму заказа с наценкой и небольшим случайным отклонением.
 * Используется при выдаче реквизитов и в уведомлениях в канал, чтобы сумма совпадала по логике.
 * @param {Object} order - объект заказа из БД (должен содержать total_price)
 */
export async function getOrderFinalAmountWithDeviation(order) {
    const base = await getOrderAmountWithMarkup(order);
    const deviation = 1 + Math.floor(Math.random() * 100);
    return base + deviation;
}

