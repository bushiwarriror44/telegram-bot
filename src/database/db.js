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
    console.log('[DB] Проверка методов: get=', typeof this.db.get, 'all=', typeof this.db.all);
    // Для run НЕ переопределяем, используем оригинальный метод напрямую
    console.log('[DB] Конструктор Database: завершен');
    console.log('[DB] Проверка методов класса: run=', typeof this.run, 'get=', typeof this.get, 'all=', typeof this.all);
  }

  // Метод run с сохранением lastID и changes
  async run(sql, params = []) {
    console.log('[DB.run] Начало выполнения SQL');
    console.log('[DB.run] SQL:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
    console.log('[DB.run] Параметры:', JSON.stringify(params));
    const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
    console.log('[DB.run] Это INSERT операция?', isInsert);

    return new Promise((resolve, reject) => {
      try {
        // Используем db.run напрямую - callback получает Statement в this
        console.log('[DB.run] Вызов db.run...');
        this.db.run(sql, params, function (err) {
          console.log('[DB.run] Callback вызван');
          console.log('[DB.run] Ошибка:', err ? err.message : 'нет');
          console.log('[DB.run] this:', typeof this);
          console.log('[DB.run] this.constructor.name:', this?.constructor?.name);
          console.log('[DB.run] this.lastID:', this?.lastID);
          console.log('[DB.run] this.changes:', this?.changes);
          console.log('[DB.run] this.lastInsertRowid:', this?.lastInsertRowid);

          // Проверяем все возможные свойства
          console.log('[DB.run] Все свойства this:', Object.keys(this || {}));

          if (err) {
            console.error('[DB.run] ОШИБКА при выполнении:', err);
            reject(err);
            return;
          }

          // this здесь - это Statement объект от sqlite3
          // lastID доступен через this.lastID для INSERT операций
          // Для других операций (CREATE, UPDATE, DELETE) lastID будет 0 или undefined
          let lastID = 0;
          if (this && this.lastID !== undefined && this.lastID !== null) {
            lastID = this.lastID;
          } else if (this && this.lastInsertRowid !== undefined && this.lastInsertRowid !== null) {
            lastID = this.lastInsertRowid;
          }

          const changes = (this && this.changes !== undefined) ? this.changes : 0;

          console.log('[DB.run] Финальный результат - lastID:', lastID, 'changes:', changes);
          console.log('[DB.run] Тип lastID:', typeof lastID, 'Значение:', lastID);

          const result = {
            lastID: lastID,
            changes: changes
          };

          console.log('[DB.run] Возвращаемый результат:', JSON.stringify(result));
          resolve(result);
        });

        console.log('[DB.run] db.run вызван');
      } catch (error) {
        console.error('[DB.run] ИСКЛЮЧЕНИЕ при вызове db.run:', error);
        console.error('[DB.run] Stack:', error.stack);
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
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица заказов
    await this.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_chat_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        city_id INTEGER NOT NULL,
        quantity REAL DEFAULT 1,
        total_price REAL NOT NULL,
        payment_method_id INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_chat_id) REFERENCES users(chat_id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
      )
    `);

    // Таблица истории пополнений
    await this.run(`
      CREATE TABLE IF NOT EXISTS topups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_chat_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_method_id INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_chat_id) REFERENCES users(chat_id) ON DELETE CASCADE,
        FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
      )
    `);

    // Таблица настроек бота
    await this.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Инициализация приветственного сообщения по умолчанию
    const defaultWelcomeMessage = `💎 Добро пожаловать 🎯 TEST BOT 🎯
Наши актуальные контакты: @testbot
‼️‼️‼️ Внимание‼️‼️‼️
🌟🌟🌟 Уважаемые покупатели! 🌟🌟🌟

✅ В боте и на сайте доступны удобные способы оплаты на карту!
• Для успешных покупок выберите в боте метод оплаты ТРАНСГРАН и используйте одно из приложений:
🏧 KwikPay, 〽️ Sendy, 👑 Золотая Корона.

✅ Оплата через криптовалюту доступна круглосуточно, без сбоев.

Если у вас есть вопросы, не стесняйтесь обращаться в 🔝 техподдержку 🔝 – мы всегда готовы помочь!
❣️ Мы рады помочь вам! ❣️
@testbot`;

    const existingWelcome = await this.get('SELECT * FROM settings WHERE key = ?', ['welcome_message']);
    if (!existingWelcome) {
      await this.run(
        'INSERT INTO settings (key, value) VALUES (?, ?)',
        ['welcome_message', defaultWelcomeMessage]
      );
    }

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

    // Таблица кнопок меню
    await this.run(`
      CREATE TABLE IF NOT EXISTS menu_buttons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        message TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица промокодов
    await this.run(`
      CREATE TABLE IF NOT EXISTS promocodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        discount_percent INTEGER NOT NULL CHECK(discount_percent >= 1 AND discount_percent <= 99),
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        created_by_admin_id INTEGER
      )
    `);

    // Таблица связи пользователей и промокодов
    await this.run(`
      CREATE TABLE IF NOT EXISTS user_promocodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_chat_id INTEGER NOT NULL,
        promocode_id INTEGER NOT NULL,
        used INTEGER DEFAULT 0,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_chat_id) REFERENCES users(chat_id) ON DELETE CASCADE,
        FOREIGN KEY (promocode_id) REFERENCES promocodes(id) ON DELETE CASCADE
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

    // Таблица просмотров товаров
    await this.run(`
      CREATE TABLE IF NOT EXISTS product_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        user_chat_id INTEGER,
        viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (user_chat_id) REFERENCES users(chat_id) ON DELETE SET NULL
      )
    `);

    // Индекс для быстрого поиска просмотров по товару
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_product_views_product_id ON product_views(product_id)'
    );

    // Миграция: добавляем колонку balance в существующую таблицу users при необходимости
    const userColumns = await this.db.all('PRAGMA table_info(users)');
    const hasBalance = userColumns.some((col) => col.name === 'balance');
    if (!hasBalance) {
      await this.run('ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0');
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

    // Индексы для новых таблиц
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_orders_user_chat_id ON orders(user_chat_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_topups_user_chat_id ON topups(user_chat_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_topups_created_at ON topups(created_at)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_menu_buttons_enabled ON menu_buttons(enabled)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_menu_buttons_order ON menu_buttons(order_index)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_promocodes_code ON promocodes(code)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_promocodes_enabled ON promocodes(enabled)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_user_promocodes_user_chat_id ON user_promocodes(user_chat_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_user_promocodes_promocode_id ON user_promocodes(promocode_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_user_promocodes_used ON user_promocodes(used)'
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

  async reconnect() {
    // Закрываем текущее подключение
    await this.close();

    // Пересоздаем подключение
    const dbPath = config.dbPath.startsWith('./') || config.dbPath.startsWith('../')
      ? join(__dirname, '../..', config.dbPath)
      : config.dbPath;

    this.db = new sqlite3.Database(dbPath);
    this.db.get = promisify(this.db.get.bind(this.db));
    this.db.all = promisify(this.db.all.bind(this.db));

    // Инициализируем БД (создаем таблицы если их нет)
    await this.init();
  }
}

export const database = new Database();

