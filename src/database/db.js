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
    console.log('[DB] Конструктор Database: начало');
    const dbDir = join(__dirname, '../../database');
    console.log('[DB] Директория БД:', dbDir);
    if (!existsSync(dbDir)) {
      console.log('[DB] Создаем директорию БД');
      mkdirSync(dbDir, { recursive: true });
    }

    // Используем абсолютный путь к базе данных
    const dbPath = config.dbPath.startsWith('./') || config.dbPath.startsWith('../')
      ? join(__dirname, '../..', config.dbPath)
      : config.dbPath;
    console.log('[DB] Путь к файлу БД:', dbPath);

    this.db = new sqlite3.Database(dbPath);
    console.log('[DB] Экземпляр sqlite3.Database создан');

    // Для get и all используем promisify
    this.db.get = promisify(this.db.get.bind(this.db));
    this.db.all = promisify(this.db.all.bind(this.db));
    console.log('[DB] Методы get и all промисфицированы');
    // Для run НЕ переопределяем, используем оригинальный метод напрямую
    console.log('[DB] Конструктор Database: завершен');
  }

  // Метод run с сохранением lastID и changes
  async run(sql, params = []) {
    console.log('[DB.run] Начало выполнения SQL');
    console.log('[DB.run] SQL:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
    console.log('[DB.run] Параметры:', JSON.stringify(params));

    return new Promise((resolve, reject) => {
      try {
        // Используем prepare для получения Statement объекта
        console.log('[DB.run] Подготовка statement...');
        const stmt = this.db.prepare(sql);
        console.log('[DB.run] Statement создан:', typeof stmt);

        stmt.run(params, function (err) {
          console.log('[DB.run] Callback вызван');
          console.log('[DB.run] Ошибка:', err ? err.message : 'нет');
          console.log('[DB.run] this:', typeof this);
          console.log('[DB.run] this.lastID:', this?.lastID);
          console.log('[DB.run] this.changes:', this?.changes);
          console.log('[DB.run] this.lastInsertRowid:', this?.lastInsertRowid);

          if (err) {
            console.error('[DB.run] ОШИБКА при выполнении:', err);
            stmt.finalize();
            reject(err);
            return;
          }

          // this здесь - это Statement объект от sqlite3
          // lastID доступен через this.lastID
          const lastID = this.lastID !== undefined ? this.lastID : 0;
          const changes = this.changes !== undefined ? this.changes : 0;

          console.log('[DB.run] Результат - lastID:', lastID, 'changes:', changes);

          const result = {
            lastID: lastID,
            changes: changes
          };

          console.log('[DB.run] Возвращаемый результат:', JSON.stringify(result));
          stmt.finalize();
          resolve(result);
        });
      } catch (error) {
        console.error('[DB.run] ИСКЛЮЧЕНИЕ при подготовке statement:', error);
        reject(error);
      }
    });
  }

  async get(sql, params = []) {
    return await this.db.get(sql, params);
  }

  async all(sql, params = []) {
    return await this.db.all(sql, params);
  }

  async init() {
    console.log('[DB.init] Начало инициализации БД');
    // Таблица городов
    console.log('[DB.init] Создание таблицы cities...');
    await this.run(`
      CREATE TABLE IF NOT EXISTS cities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица фасовок
    await this.run(`
      CREATE TABLE IF NOT EXISTS packagings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        value REAL NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица товаров
    await this.run(`
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
    await this.run(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        network TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица реквизитов для оплаты
    await this.run(`
      CREATE TABLE IF NOT EXISTS payment_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_method_id INTEGER NOT NULL,
        address TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
      )
    `);

    // Таблица пользователей для рассылки уведомлений
    await this.run(`
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
    await this.run(`
      CREATE TABLE IF NOT EXISTS card_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица сообщений поддержки
    await this.run(`
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
      await this.run('ALTER TABLE products ADD COLUMN packaging_id INTEGER');
    }

    // Миграция: добавляем колонку type в существующую таблицу payment_methods при необходимости
    const paymentMethodColumns = await this.db.all('PRAGMA table_info(payment_methods)');
    const hasType = paymentMethodColumns.some((col) => col.name === 'type');
    if (!hasType) {
      await this.run("ALTER TABLE payment_methods ADD COLUMN type TEXT DEFAULT 'crypto'");
    }

    // Индексы для оптимизации
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_products_city_id ON products(city_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_payment_addresses_method_id ON payment_addresses(payment_method_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users(chat_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_card_accounts_enabled ON card_accounts(enabled)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_support_messages_user_chat_id ON support_messages(user_chat_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at)'
    );
    console.log('[DB.init] Все индексы созданы');
    console.log('[DB.init] Инициализация БД завершена успешно');
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

