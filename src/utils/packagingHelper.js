/**
 * Форматирует значение фасовки для отображения
 * @param {number} value - Значение фасовки в граммах
 * @returns {string} - Отформатированная строка (например: "0.25 г" или "1 кг")
 */
export function formatPackaging(value) {
    if (!value || value === null || value === undefined) {
        return 'Не указана';
    }

    // Если значение >= 1000, показываем в килограммах
    if (value >= 1000) {
        const kg = value / 1000;
        // Убираем лишние нули после запятой
        const formattedKg = kg % 1 === 0 ? kg.toString() : kg.toFixed(2).replace(/\.?0+$/, '');
        return `${formattedKg} кг`;
    }

    // Если значение < 1000, показываем в граммах
    // Убираем лишние нули после запятой
    const formattedG = value % 1 === 0 ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '');
    return `${formattedG} г`;
}
