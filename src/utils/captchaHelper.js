/**
 * Утилиты для работы с капчей
 */

// Хранилище активных капч для пользователей (userId -> { question, answer, timestamp })
const activeCaptchas = new Map();

// Хранилище параметров start для пользователей, проходящих капчу (userId -> startParam)
const startParams = new Map();

// Время жизни капчи в миллисекундах (5 минут)
const CAPTCHA_EXPIRY_TIME = 5 * 60 * 1000;

/**
 * Генерирует случайную математическую капчу
 * @returns {Object} Объект с вопросом и правильным ответом
 */
export function generateCaptcha() {
    const operations = [
        { op: '+', func: (a, b) => a + b },
        { op: '-', func: (a, b) => a - b },
        { op: '*', func: (a, b) => a * b }
    ];

    // Выбираем случайную операцию
    const operation = operations[Math.floor(Math.random() * operations.length)];

    let num1, num2, answer;

    // Генерируем числа в зависимости от операции
    if (operation.op === '+') {
        num1 = Math.floor(Math.random() * 20) + 1; // 1-20
        num2 = Math.floor(Math.random() * 20) + 1; // 1-20
        answer = operation.func(num1, num2);
    } else if (operation.op === '-') {
        num1 = Math.floor(Math.random() * 30) + 10; // 10-39
        num2 = Math.floor(Math.random() * num1) + 1; // 1-num1
        answer = operation.func(num1, num2);
    } else { // умножение
        num1 = Math.floor(Math.random() * 10) + 1; // 1-10
        num2 = Math.floor(Math.random() * 10) + 1; // 1-10
        answer = operation.func(num1, num2);
    }

    const question = `${num1} ${operation.op} ${num2} = ?`;

    return {
        question,
        answer: answer.toString()
    };
}

/**
 * Сохраняет капчу для пользователя
 * @param {number} userId - ID пользователя
 * @param {string} question - Вопрос капчи
 * @param {string} answer - Правильный ответ
 */
export function saveCaptcha(userId, question, answer) {
    activeCaptchas.set(userId, {
        question,
        answer,
        timestamp: Date.now()
    });
}

/**
 * Проверяет ответ пользователя на капчу
 * @param {number} userId - ID пользователя
 * @param {string} userAnswer - Ответ пользователя
 * @returns {boolean} true, если ответ правильный
 */
export function validateCaptcha(userId, userAnswer) {
    const captcha = activeCaptchas.get(userId);

    if (!captcha) {
        return false; // Капча не найдена или истекла
    }

    // Проверяем время жизни капчи
    if (Date.now() - captcha.timestamp > CAPTCHA_EXPIRY_TIME) {
        activeCaptchas.delete(userId);
        return false; // Капча истекла
    }

    // Нормализуем ответы (убираем пробелы, приводим к строке)
    const normalizedUserAnswer = userAnswer.toString().trim();
    const normalizedCorrectAnswer = captcha.answer.toString().trim();

    const isValid = normalizedUserAnswer === normalizedCorrectAnswer;

    // Удаляем капчу после проверки (независимо от результата)
    activeCaptchas.delete(userId);

    return isValid;
}

/**
 * Удаляет капчу для пользователя (например, при отмене)
 * @param {number} userId - ID пользователя
 */
export function clearCaptcha(userId) {
    activeCaptchas.delete(userId);
}

/**
 * Проверяет, есть ли активная капча для пользователя
 * @param {number} userId - ID пользователя
 * @returns {boolean} true, если есть активная капча
 */
export function hasActiveCaptcha(userId) {
    const captcha = activeCaptchas.get(userId);
    if (!captcha) {
        return false;
    }

    // Проверяем время жизни
    if (Date.now() - captcha.timestamp > CAPTCHA_EXPIRY_TIME) {
        activeCaptchas.delete(userId);
        return false;
    }

    return true;
}

/**
 * Получает вопрос капчи для пользователя
 * @param {number} userId - ID пользователя
 * @returns {string|null} Вопрос капчи или null, если капча не найдена
 */
export function getCaptchaQuestion(userId) {
    const captcha = activeCaptchas.get(userId);
    if (!captcha) {
        return null;
    }

    // Проверяем время жизни
    if (Date.now() - captcha.timestamp > CAPTCHA_EXPIRY_TIME) {
        activeCaptchas.delete(userId);
        return null;
    }

    return captcha.question;
}

/**
 * Сохраняет параметр start для пользователя (для обработки после прохождения капчи)
 * @param {number} userId - ID пользователя
 * @param {string} startParam - Параметр команды /start
 */
export function saveStartParam(userId, startParam) {
    startParams.set(userId, startParam);
}

/**
 * Получает и удаляет параметр start для пользователя
 * @param {number} userId - ID пользователя
 * @returns {string|null} Параметр start или null
 */
export function getStartParam(userId) {
    const param = startParams.get(userId);
    if (param) {
        startParams.delete(userId);
    }
    return param || null;
}
