import dotenv from 'dotenv';

dotenv.config();

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

const botTokensString = process.env.BOT_TOKEN || '';
const botTokens = parseBotTokens(botTokensString);

export const config = {
  // Для обратной совместимости: если указан один токен, используем его
  botToken: botTokens.length > 0 ? botTokens[0] : '',
  // Массив всех токенов ботов
  botTokens: botTokens,
  adminPassword: process.env.ADMIN_PASSWORD || 'password123',
  dbPath: process.env.DB_PATH || './database/bot.db',
  captchaEnabled: process.env.CAPTCHA_ENABLED === 'TRUE' || process.env.CAPTCHA_ENABLED === 'true',
};

