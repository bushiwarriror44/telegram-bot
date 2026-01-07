import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { config } from '../config/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Database {
  constructor() {
    const dbDir = join(__dirname, '../../database');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    // Используем абсолютный путь к базе данных
    const dbPath = config.dbPath.startsWith('./') || config.dbPath.startsWith('../')
      ? join(__dirname, '../..', config.dbPath)
      : config.dbPath;

    this.db = new sqlite3.Database(dbPath);
    this.db.run = promisify(this.db.run.bind(this.db));
    this.db.get = promisify(this.db.get.bind(this.db));
    this.db.all = promisify(this.db.all.bind(this.db));
  }

  async init() {
    // Таблица городов
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS cities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица фасовок
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS packagings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        value REAL NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица товаров
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        city_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        packaging_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
      )
    `);

    // Таблица методов оплаты
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        network TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица реквизитов для оплаты
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS payment_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_method_id INTEGER NOT NULL,
        address TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
      )
    `);

    // Таблица пользователей для рассылки уведомлений
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL UNIQUE,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица карточных счетов
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS card_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица сообщений поддержки
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_chat_id INTEGER NOT NULL,
        message_text TEXT NOT NULL,
        is_from_admin INTEGER DEFAULT 0,
        admin_chat_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_chat_id) REFERENCES users(chat_id) ON DELETE CASCADE
      )
    `);

    // Миграция: добавляем колонку packaging_id в существующую таблицу products при необходимости
    const productColumns = await this.db.all('PRAGMA table_info(products)');
    const hasPackagingId = productColumns.some((col) => col.name === 'packaging_id');
    if (!hasPackagingId) {
      await this.db.run('ALTER TABLE products ADD COLUMN packaging_id INTEGER');
    }

    // Миграция: добавляем колонку type в существующую таблицу payment_methods при необходимости
    const paymentMethodColumns = await this.db.all('PRAGMA table_info(payment_methods)');
    const hasType = paymentMethodColumns.some((col) => col.name === 'type');
    if (!hasType) {
      await this.db.run("ALTER TABLE payment_methods ADD COLUMN type TEXT DEFAULT 'crypto'");
    }

    // Индексы для оптимизации
    await this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_products_city_id ON products(city_id)'
    );
    await this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_payment_addresses_method_id ON payment_addresses(payment_method_id)'
    );
    await this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users(chat_id)'
    );
    await this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_card_accounts_enabled ON card_accounts(enabled)'
    );
    await this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_support_messages_user_chat_id ON support_messages(user_chat_id)'
    );
    await this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at)'
    );
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export const database = new Database();

