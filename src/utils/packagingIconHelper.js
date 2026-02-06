import { settingsService } from '../services/settingsService.js';

/**
 * Возвращает ключ настройки для иконки фасовки.
 * Храним иконки фасовок в таблице settings, чтобы не менять структуру основных таблиц.
 */
function getPackagingIconKey(packagingId) {
    return `packaging_icon_${packagingId}`;
}

/**
 * Получает иконку для фасовки по её ID.
 * Возвращает пустую строку, если иконка не задана.
 * @param {number} packagingId
 * @returns {Promise<string>}
 */
export async function getPackagingIcon(packagingId) {
    if (!packagingId) return '';
    const key = getPackagingIconKey(packagingId);
    const value = await settingsService.get(key, '');
    return value || '';
}

/**
 * Устанавливает иконку для фасовки по её ID.
 * Пустая строка или '-' очищают иконку.
 * @param {number} packagingId
 * @param {string} icon
 * @returns {Promise<void>}
 */
export async function setPackagingIcon(packagingId, icon) {
    if (!packagingId) return;
    const key = getPackagingIconKey(packagingId);
    const normalized = !icon || icon.trim() === '-' ? '' : icon.trim();
    await settingsService.set(key, normalized);
}

