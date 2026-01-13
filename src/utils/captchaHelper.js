/**
 * Утилиты для работы с капчей
 */

import svgCaptcha from 'svg-captcha';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Хранилище активных капч для пользователей (userId -> { answer, imagePath, timestamp })
const activeCaptchas = new Map();

// Хранилище параметров start для пользователей, проходящих капчу (userId -> startParam)
const startParams = new Map();

// Время жизни капчи в миллисекундах (5 минут)
const CAPTCHA_EXPIRY_TIME = 5 * 60 * 1000;

// Временная директория для хранения изображений капчи
const TEMP_DIR = join(__dirname, '../../temp');

/**
 * Генерирует графическую капчу с изображением
 * @returns {Promise<Object>} Объект с путем к изображению и правильным ответом
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

    // Создаем временную директорию, если её нет
    try {
        const { mkdirSync } = await import('fs');
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
        return {
            imagePath: svgPath,
            answer: captcha.text.toLowerCase(), // Приводим к нижнему регистру для сравнения
            isSvg: true
        };
    }

    return {
        imagePath,
        answer: captcha.text.toLowerCase(), // Приводим к нижнему регистру для сравнения
        isSvg: false
    };
}

/**
 * Сохраняет капчу для пользователя
 * @param {number} userId - ID пользователя
 * @param {string} imagePath - Путь к изображению капчи
 * @param {string} answer - Правильный ответ
 */
export function saveCaptcha(userId, imagePath, answer) {
    activeCaptchas.set(userId, {
        imagePath,
        answer,
        timestamp: Date.now()
    });
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
