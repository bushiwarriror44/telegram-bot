import dotenv from 'dotenv';

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'password123',
  dbPath: process.env.DB_PATH || './database/bot.db',
  captchaEnabled: process.env.CAPTCHA_ENABLED === 'TRUE' || process.env.CAPTCHA_ENABLED === 'true',
};

