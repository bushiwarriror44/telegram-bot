import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Получаем путь к текущему файлу и директорию проекта
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Загружаем .env файл из корня проекта
const envPath = join(projectRoot, '.env');
console.log('[CONFIG] Путь к проекту:', projectRoot);
console.log('[CONFIG] Ожидаемый путь к .env:', envPath);
console.log('[CONFIG] Файл .env существует:', existsSync(envPath));

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[CONFIG] ✅ Файл .env загружен из:', envPath);
} else {
  // Пробуем загрузить из текущей директории (для обратной совместимости)
  console.log('[CONFIG] ⚠️ Файл .env не найден по пути:', envPath);
  console.log('[CONFIG] Пробуем загрузить из текущей директории...');
  dotenv.config();
  console.log('[CONFIG] Используется стандартный путь dotenv');
}

/**
 * Парсит строку токенов, разделенных запятыми
 * @param {string} tokensString - Строка с токенами, разделенными запятыми
 * @returns {string[]} Массив токенов
 */
function parseBotTokens(tokensString) {
  if (!tokensString || tokensString.trim() === '') {
    return [];
  }

  return tokensString
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length > 0);
}

// Получаем BOT_TOKEN и убираем возможные пробелы
const botTokensString = (process.env.BOT_TOKEN || '').trim();
const botTokens = parseBotTokens(botTokensString);

// Логирование для отладки
console.log('[CONFIG] BOT_TOKEN из env:', botTokensString ? `${botTokensString.substring(0, 10)}...` : 'НЕ НАЙДЕН');
console.log('[CONFIG] Количество токенов после парсинга:', botTokens.length);
if (botTokens.length > 0) {
  botTokens.forEach((token, index) => {
    console.log(`[CONFIG] Токен #${index + 1}: ${token.substring(0, 10)}...`);
  });
}

export const config = {
  // Для обратной совместимости: если указан один токен, используем его
  botToken: botTokens.length > 0 ? botTokens[0] : '',
  // Массив всех токенов ботов
  botTokens: botTokens,
  adminPassword: (process.env.ADMIN_PASSWORD || 'password123').trim(),
  dbPath: (process.env.DB_PATH || './database/bot.db').trim(),
  captchaEnabled: process.env.CAPTCHA_ENABLED === 'TRUE' || process.env.CAPTCHA_ENABLED === 'true',
};

