/**
 * Форматирует значение фасовки для отображения
 * @param {number} value - Количество
 * @param {string} [unit='g'] - Единица измерения (g, кг, л, мл, шт, порция и т.п.)
 * @returns {string} - Отформатированная строка (например: "0.25 г", "1 кг", "1 л", "2 шт")
 */
export function formatPackaging(value, unit = 'g') {
    if (value === null || value === undefined) {
        return 'Не указана';
    }

    const num = Number(value);
    if (!Number.isFinite(num)) {
        return 'Не указана';
    }

    const u = (unit || 'g').trim();

    // Специальная логика для граммов (обратная совместимость):
    if (u === 'g' || u === 'гр' || u.toLowerCase() === 'gram' || u.toLowerCase() === 'grams') {
        if (num >= 1000) {
            const kg = num / 1000;
            const formattedKg = kg % 1 === 0 ? kg.toString() : kg.toFixed(2).replace(/\.?0+$/, '');
            return `${formattedKg} кг`;
        }
        const formattedG = num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
        return `${formattedG} г`;
    }

    // Для остальных единиц просто выводим "<число> <единица>"
    const formatted = num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
    return `${formatted} ${u}`;
}
