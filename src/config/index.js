import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

// Получаем путь к текущему файлу и директорию проекта
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Поднимаемся на 2 уровня вверх от src/config/index.js до корня проекта
const projectRoot = resolve(__dirname, '../..');

// Список возможных путей к .env файлу
const possibleEnvPaths = [
  join(projectRoot, '.env'),           // Корень проекта (основной вариант)
  join(process.cwd(), '.env'),           // Текущая рабочая директория
  resolve('.env'),                      // Относительно текущей директории
];

console.log('[CONFIG] ========== Загрузка конфигурации ==========');
console.log('[CONFIG] Путь к файлу конфига:', __filename);
console.log('[CONFIG] Директория конфига:', __dirname);
console.log('[CONFIG] Корень проекта (вычисленный):', projectRoot);
console.log('[CONFIG] Текущая рабочая директория:', process.cwd());

let envLoaded = false;
let loadedEnvPath = null;

// Пробуем загрузить .env из разных возможных мест
for (const envPath of possibleEnvPaths) {
  console.log('[CONFIG] Проверка пути:', envPath);
  if (existsSync(envPath)) {
    console.log('[CONFIG] ✅ Файл .env найден по пути:', envPath);
    try {
      // Читаем содержимое файла для диагностики (первые 200 символов)
      const envContent = readFileSync(envPath, 'utf8');
      console.log('[CONFIG] Содержимое .env (первые 200 символов):');
      console.log('[CONFIG]', envContent.substring(0, 200).replace(/\n/g, '\\n'));
      
      // Загружаем переменные окружения
      dotenv.config({ path: envPath });
      envLoaded = true;
      loadedEnvPath = envPath;
      console.log('[CONFIG] ✅ Переменные окружения загружены из:', envPath);
      break;
    } catch (error) {
      console.error('[CONFIG] ❌ Ошибка при чтении .env файла:', error.message);
    }
  } else {
    console.log('[CONFIG] ❌ Файл .env не найден по пути:', envPath);
  }
}

// Если ни один путь не сработал, пробуем стандартный способ dotenv
if (!envLoaded) {
  console.log('[CONFIG] ⚠️ Файл .env не найден ни в одном из проверенных путей');
  console.log('[CONFIG] Пробуем стандартный способ dotenv.config()...');
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
console.log('[CONFIG] ========== Проверка переменных окружения ==========');
console.log('[CONFIG] BOT_TOKEN из process.env (сырой):', process.env.BOT_TOKEN ? `"${process.env.BOT_TOKEN.substring(0, 20)}..."` : 'НЕ НАЙДЕН');
console.log('[CONFIG] BOT_TOKEN после trim:', botTokensString ? `"${botTokensString.substring(0, 20)}..."` : 'НЕ НАЙДЕН');
console.log('[CONFIG] Количество токенов после парсинга:', botTokens.length);
if (botTokens.length > 0) {
  botTokens.forEach((token, index) => {
    console.log(`[CONFIG] Токен #${index + 1}: ${token.substring(0, 10)}...`);
  });
} else {
  console.log('[CONFIG] ⚠️ ВНИМАНИЕ: Токены не найдены!');
  console.log('[CONFIG] Проверьте, что файл .env находится в правильном месте и содержит BOT_TOKEN');
  if (loadedEnvPath) {
    console.log('[CONFIG] Файл .env был загружен из:', loadedEnvPath);
  }
}
console.log('[CONFIG] ADMIN_PASSWORD:', process.env.ADMIN_PASSWORD ? 'установлен' : 'НЕ НАЙДЕН');
console.log('[CONFIG] DB_PATH:', process.env.DB_PATH || 'не установлен');
console.log('[CONFIG] CAPTCHA_ENABLED:', process.env.CAPTCHA_ENABLED || 'не установлен');
console.log('[CONFIG] ================================================');

export const config = {
  // Для обратной совместимости: если указан один токен, используем его
  botToken: botTokens.length > 0 ? botTokens[0] : '',
  // Массив всех токенов ботов
  botTokens: botTokens,
  adminPassword: (process.env.ADMIN_PASSWORD || 'password123').trim(),
  dbPath: (process.env.DB_PATH || './database/bot.db').trim(),
  captchaEnabled: process.env.CAPTCHA_ENABLED === 'TRUE' || process.env.CAPTCHA_ENABLED === 'true',
};

