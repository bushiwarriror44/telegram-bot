/**
 * Утилиты для работы с капчей
 */

import svgCaptcha from 'svg-captcha';
import { writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Хранилище активных капч для пользователей (userId -> { answer, imagePath, timestamp })
const activeCaptchas = new Map();

// Хранилище параметров start для пользователей, проходящих капчу (userId -> startParam)
const startParams = new Map();

// Хранилище времени успешного прохождения капчи (userId -> timestamp)
const captchaPassedTimes = new Map();

// Время жизни капчи в миллисекундах (5 минут)
const CAPTCHA_EXPIRY_TIME = 5 * 60 * 1000;

// Время, в течение которого капча не запрашивается после успешного прохождения (15 минут)
const CAPTCHA_PASSED_COOLDOWN = 15 * 60 * 1000;

// Временная директория для хранения изображений капчи
const TEMP_DIR = join(__dirname, '../../temp');

/**
 * Генерирует похожие варианты для капчи (неправильные ответы)
 * @param {string} correctAnswer - Правильный ответ
 * @param {number} count - Количество вариантов (включая правильный)
 * @returns {Array<string>} Массив вариантов ответов
 */
function generateSimilarOptions(correctAnswer, count = 12) {
    const options = new Set([correctAnswer.toLowerCase()]);
    const charPreset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const length = correctAnswer.length;

    // Генерируем варианты разных типов:
    // 1. Похожие варианты (изменяем 1-2 символа)
    // 2. Частично похожие (изменяем половину символов)
    // 3. Полностью случайные варианты

    while (options.size < count) {
        // Тип 1: Похожий вариант (меняем 1-2 символа)
        if (options.size < count - 4) {
            let variant = correctAnswer.split('');
            const changes = Math.floor(Math.random() * 2) + 1; // 1-2 изменения
            const positions = new Set();

            while (positions.size < changes) {
                positions.add(Math.floor(Math.random() * length));
            }

            for (const pos of positions) {
                variant[pos] = charPreset[Math.floor(Math.random() * charPreset.length)];
            }

            const variantStr = variant.join('').toLowerCase();
            if (variantStr !== correctAnswer.toLowerCase()) {
                options.add(variantStr);
            }
        }

        // Тип 2: Частично похожий (меняем половину символов)
        if (options.size < count - 2) {
            let variant = correctAnswer.split('');
            const changes = Math.floor(length / 2);
            const positions = new Set();

            while (positions.size < changes) {
                positions.add(Math.floor(Math.random() * length));
            }

            for (const pos of positions) {
                variant[pos] = charPreset[Math.floor(Math.random() * charPreset.length)];
            }

            const variantStr = variant.join('').toLowerCase();
            if (variantStr !== correctAnswer.toLowerCase()) {
                options.add(variantStr);
            }
        }

        // Тип 3: Полностью случайный вариант
        if (options.size < count) {
            let randomVariant = '';
            for (let i = 0; i < length; i++) {
                randomVariant += charPreset[Math.floor(Math.random() * charPreset.length)];
            }
            options.add(randomVariant.toLowerCase());
        }
    }

    // Преобразуем в массив и перемешиваем
    const optionsArray = Array.from(options);
    for (let i = optionsArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsArray[i], optionsArray[j]] = [optionsArray[j], optionsArray[i]];
    }

    return optionsArray;
}

/**
 * Генерирует графическую капчу с изображением
 * @returns {Promise<Object>} Объект с путем к изображению, правильным ответом и вариантами
 */
export async function generateCaptcha() {
    // Генерируем случайную строку для капчи (4-6 символов, только буквы и цифры)
    const captcha = svgCaptcha.create({
        size: 5, // Количество символов
        ignoreChars: '0o1il', // Исключаем похожие символы
        noise: 3, // Количество линий шума
        color: true, // Цветной текст
        background: '#f0f0f0', // Светлый фон
        width: 200,
        height: 80,
        fontSize: 50,
        charPreset: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789' // Только читаемые символы
    });

    // Принудительно делаем цвет символов синим (svg-captcha использует <path fill="..."> с inline-атрибутами)
    // Заменяем fill у path-элементов текста (не трогаем fill="none" у линий шума)
    if (typeof captcha.data === 'string') {
        captcha.data = captcha.data.replace(
            /fill="(?!none)[^"]+"/g,
            'fill="#0000ff"'
        );
    }

    // Создаем временную директорию, если её нет
    try {
        mkdirSync(TEMP_DIR, { recursive: true });
    } catch (error) {
        // Директория уже существует или другая ошибка
    }

    // Генерируем уникальное имя файла
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const filename = `captcha_${timestamp}_${random}.png`;
    const imagePath = join(TEMP_DIR, filename);

    // Конвертируем SVG в PNG через canvas (используем sharp для конвертации)
    try {
        const sharp = (await import('sharp')).default;
        const svgBuffer = Buffer.from(captcha.data);
        await sharp(svgBuffer)
            .png()
            .toFile(imagePath);
    } catch (error) {
        // Если sharp не установлен, сохраняем как SVG
        // Telegram может не поддерживать SVG напрямую, поэтому лучше установить sharp
        console.warn('[CaptchaHelper] Sharp не установлен, сохраняем как SVG. Установите sharp для лучшей совместимости.');
        const svgPath = imagePath.replace('.png', '.svg');
        writeFileSync(svgPath, captcha.data);
        const correctAnswer = captcha.text.toLowerCase();
        const options = generateSimilarOptions(correctAnswer, 12);

        return {
            imagePath: svgPath,
            answer: correctAnswer, // Приводим к нижнему регистру для сравнения
            options: options, // Варианты ответов для кнопок
            isSvg: true
        };
    }

    const correctAnswer = captcha.text.toLowerCase();
    const options = generateSimilarOptions(correctAnswer, 12);

    return {
        imagePath,
        answer: correctAnswer, // Приводим к нижнему регистру для сравнения
        options: options, // Варианты ответов для кнопок
        isSvg: false
    };
}

/**
 * Сохраняет капчу для пользователя
 * @param {number} userId - ID пользователя
 * @param {string} imagePath - Путь к изображению капчи
 * @param {string} answer - Правильный ответ
 * @param {Array<string>} options - Варианты ответов для кнопок
 */
export function saveCaptcha(userId, imagePath, answer, options = []) {
    activeCaptchas.set(userId, {
        imagePath,
        answer,
        options,
        timestamp: Date.now()
    });
}

/**
 * Создает reply keyboard с вариантами ответов капчи
 * @param {Array<string>} options - Массив вариантов ответов
 * @returns {Object} Объект с keyboard для Telegram (reply keyboard)
 */
export function createCaptchaButtons(options) {
    const buttons = [];
    const rows = 3; // 3 ряда
    const cols = 4; // 4 колонки

    for (let i = 0; i < rows; i++) {
        const row = [];
        for (let j = 0; j < cols; j++) {
            const index = i * cols + j;
            if (index < options.length) {
                const option = options[index];
                row.push(option.toUpperCase());
            }
        }
        if (row.length > 0) {
            buttons.push(row);
        }
    }

    return {
        keyboard: buttons,
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

/**
 * Получает путь к изображению капчи для пользователя
 * @param {number} userId - ID пользователя
 * @returns {string|null} Путь к изображению или null, если капча не найдена
 */
export function getCaptchaImagePath(userId) {
    const captcha = activeCaptchas.get(userId);
    if (!captcha) {
        return null;
    }

    // Проверяем время жизни
    if (Date.now() - captcha.timestamp > CAPTCHA_EXPIRY_TIME) {
        // Удаляем файл изображения
        try {
            if (captcha.imagePath) {
                unlinkSync(captcha.imagePath);
            }
        } catch (error) {
            // Файл уже удален или не существует
        }
        activeCaptchas.delete(userId);
        return null;
    }

    return captcha.imagePath;
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
        // Удаляем файл изображения
        deleteCaptchaImage(userId);
        activeCaptchas.delete(userId);
        return false; // Капча истекла
    }

    // Нормализуем ответы (убираем пробелы, приводим к нижнему регистру)
    const normalizedUserAnswer = userAnswer.toString().trim().toLowerCase();
    const normalizedCorrectAnswer = captcha.answer.toString().trim().toLowerCase();

    const isValid = normalizedUserAnswer === normalizedCorrectAnswer;

    // Удаляем капчу и файл изображения после проверки (независимо от результата)
    deleteCaptchaImage(userId);
    activeCaptchas.delete(userId);

    // Если капча пройдена успешно, сохраняем время прохождения
    if (isValid) {
        captchaPassedTimes.set(userId, Date.now());
        console.log('[CaptchaHelper] Капча успешно пройдена пользователем', userId, 'время:', new Date().toISOString());
    }

    return isValid;
}

/**
 * Удаляет капчу для пользователя (например, при отмене)
 * @param {number} userId - ID пользователя
 */
export function clearCaptcha(userId) {
    deleteCaptchaImage(userId);
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
        deleteCaptchaImage(userId);
        activeCaptchas.delete(userId);
        return false;
    }

    return true;
}

/**
 * Удаляет файл изображения капчи для пользователя
 * @param {number} userId - ID пользователя
 */
export function deleteCaptchaImage(userId) {
    const captcha = activeCaptchas.get(userId);
    if (captcha && captcha.imagePath) {
        try {
            unlinkSync(captcha.imagePath);
        } catch (error) {
            // Файл уже удален или не существует
        }
    }
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

/**
 * Проверяет, прошло ли менее 15 минут с момента успешного прохождения капчи
 * @param {number} userId - ID пользователя
 * @returns {boolean} true, если капча была пройдена менее 15 минут назад
 */
export function isCaptchaRecentlyPassed(userId) {
    const passedTime = captchaPassedTimes.get(userId);
    if (!passedTime) {
        return false;
    }

    const timeSincePassed = Date.now() - passedTime;
    const isRecent = timeSincePassed < CAPTCHA_PASSED_COOLDOWN;

    // Если прошло больше 15 минут, удаляем запись
    if (!isRecent) {
        captchaPassedTimes.delete(userId);
        console.log('[CaptchaHelper] Время действия капчи истекло для пользователя', userId);
        return false;
    }

    console.log('[CaptchaHelper] Капча была пройдена', Math.floor(timeSincePassed / 1000), 'секунд назад для пользователя', userId);
    return true;
}
