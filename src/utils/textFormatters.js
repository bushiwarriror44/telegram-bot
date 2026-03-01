/**
 * Утилиты для форматирования текстов
 */

/**
 * Генерирует TXID на основе ID (формат: gt{2 цифры из ID}-{4 hex}-{4 hex}-{4 hex}-{4 hex}-{12 hex})
 * @param {number|string} id - ID для генерации TXID
 * @returns {string} Сгенерированный TXID
 */
export function generateTXID(id) {
    const idHex = id.toString(16).padStart(8, '0');
    let hash = 0;
    for (let i = 0; i < idHex.length; i++) {
        hash = ((hash * 1103515245) + 12345) & 0x7fffffff;
    }
    const hashHex = hash.toString(16).padStart(8, '0');
    // Формат: gt{2 цифры из ID}-{4 hex}-{4 hex}-{4 hex}-{4 hex}-{12 hex}
    const part1 = idHex.substring(0, 2);
    const part2 = idHex.substring(2, 6);
    const part3 = hashHex.substring(0, 4);
    const part4 = hashHex.substring(4, 8);
    const part5 = (idHex + hashHex).substring(0, 4);
    const part6 = (idHex + hashHex).substring(4, 16);
    return `gt${part1}-${part2}-${part3}-${part4}-${part5}-${part6}`;
}

/**
 * Генерирует текст заявки на оплату
 * @param {number|string} orderId - ID заказа/заявки
 * @param {string} txid - TXID транзакции
 * @param {string} amountText - Текст с суммой (уже отформатированный)
 * @param {string} paymentDetails - Реквизиты для оплаты (номер карты или адрес)
 * @returns {string} Отформатированный текст заявки
 */
export function generatePaymentRequestText(orderId, txid, amountText, paymentDetails) {
    return `<b>Создана заявка #95${orderId}73</b>\n\n` +
        `TxID: <code>${txid}</code>\n\n` +
        `💵 Переведите: <code>${amountText}</code>\n\n` +
        `💳 <b>Реквизиты для оплаты:</b>\n<code>${paymentDetails}</code>\n\n` +
        `Если Вы оплатили неверную сумму или не успели провести оплату вовремя, отпишите в поддержку.\n` +
        `‼️ Контакт указан в кнопке ниже "Поддержка".\n` +
        `Оплачивайте точную сумму в заявке, иначе рискуете потерять деньги.\n` +
        `Время на оплату - 30 минут, если не успеваете пересоздайте заявку.\n`
        
}

/**
 * Генерирует текст заявки на пополнение баланса (с полями «Будет зачислено» и «Сумма к переводу»)
 * @param {number|string} topupId - ID заявки на пополнение
 * @param {string} txid - TXID
 * @param {string} amountCreditedText - Текст «будет зачислено» (например "2 000 ₸")
 * @param {string} amountToTransferText - Текст «сумма к переводу» (тенге или крипта)
 * @param {string} paymentDetails - Реквизиты (карта или адрес)
 * @returns {string} Отформатированный текст заявки
 */
export function generateTopupRequestText(topupId, txid, amountCreditedText, amountToTransferText, paymentDetails) {
    return `<b>Создана заявка #95${topupId}73</b>\n\n` +
        `TxID: <code>${txid}</code>\n\n` +
        `Будет зачислено на баланс: <code>${amountCreditedText}</code>\n\n` +
        `Сумма к переводу: <code>${amountToTransferText}</code>\n\n` +
        `💳 <b>Реквизиты для оплаты:</b>\n<code>${paymentDetails}</code>\n\n` +
        `Если Вы оплатили неверную сумму или не успели провести оплату вовремя, отпишите в поддержку.\n` +
        `‼️ Контакт указан в кнопке ниже "Поддержка".\n` +
        `Оплачивайте точную сумму к переводу, иначе рискуете потерять деньги.\n` +
        `Время на оплату - 30 минут, если не успеваете пересоздайте заявку.\n`;
}

/**
 * Генерирует текст подтверждения списания с баланса (без реквизитов)
 * @param {number|string} orderId - ID заказа
 * @param {string} amountText - Текст с суммой (уже отформатированный, например "5 500 ₸")
 * @returns {string} Отформатированный текст для экрана подтверждения
 */
export function generateBalanceDeductionConfirmText(orderId, amountText) {
    return `<b>Создана заявка #95${orderId}73</b>\n\n` +
        `С вашего баланса будет списано: <code>${amountText}</code>\n\n` +
        `Подтверждаете ли вы списание с баланса?`;
}

/**
 * Форматирует дату в формат "17:42 08.01.2026"
 * @param {string|Date} dateString - Дата для форматирования
 * @returns {string} Отформатированная дата
 */
export function formatDate(dateString) {
    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${hours}:${minutes} ${day}.${month}.${year}`;
}

/**
 * Форматирует дату заказа в формат "22:57 10.01.2026"
 * @param {string|Date} dateString - Дата для форматирования
 * @returns {string} Отформатированная дата
 */
export function formatOrderDate(dateString) {
    return formatDate(dateString); // Используем ту же функцию
}
