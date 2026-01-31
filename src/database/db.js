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
            // UNIQUE constraint при повторной вставке — ожидаемо, не логируем как ошибку
            if (err.code === 'SQLITE_CONSTRAINT' && /UNIQUE constraint failed/i.test(err.message)) {
              console.log('[DB.run] UNIQUE constraint (запись уже существует):', err.message);
            } else {
              console.error('[DB.run] ОШИБКА при выполнении:', err);
            }
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

    // Таблица районов
    await this.run(`
      CREATE TABLE IF NOT EXISTS districts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        city_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
        UNIQUE(city_id, name)
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
        district_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        packaging_id INTEGER,
        image_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
        FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE
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
        blocked INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица рефералов
    await this.run(`
      CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_chat_id INTEGER NOT NULL,
        referred_chat_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_chat_id) REFERENCES users(chat_id) ON DELETE CASCADE,
        FOREIGN KEY (referred_chat_id) REFERENCES users(chat_id) ON DELETE CASCADE,
        UNIQUE(referred_chat_id)
      )
    `);

    // Таблица реферальных кодов пользователей
    await this.run(`
      CREATE TABLE IF NOT EXISTS user_referral_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_chat_id INTEGER NOT NULL UNIQUE,
        code TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_chat_id) REFERENCES users(chat_id) ON DELETE CASCADE
      )
    `);

    // Таблица заказов
    await this.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_chat_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        city_id INTEGER NOT NULL,
        district_id INTEGER NOT NULL,
        quantity REAL DEFAULT 1,
        price REAL NOT NULL,
        discount REAL DEFAULT 0,
        total_price REAL NOT NULL,
        promocode_id INTEGER,
        payment_method_id INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_chat_id) REFERENCES users(chat_id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
        FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE,
        FOREIGN KEY (promocode_id) REFERENCES promocodes(id) ON DELETE SET NULL
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
        cards TEXT,
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
        message_type TEXT DEFAULT 'question',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_chat_id) REFERENCES users(chat_id) ON DELETE CASCADE
      )
    `);

    // Добавляем колонку message_type, если её нет (для существующих БД)
    const supportMessagesColumns = await this.db.all('PRAGMA table_info(support_messages)');
    const hasMessageType = supportMessagesColumns.some((col) => col.name === 'message_type');
    if (!hasMessageType) {
      await this.run(`ALTER TABLE support_messages ADD COLUMN message_type TEXT DEFAULT 'question'`);
    }

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

    // Миграция: добавляем колонки в существующую таблицу users при необходимости
    const userColumns = await this.db.all('PRAGMA table_info(users)');
    const hasBlocked = userColumns.some((col) => col.name === 'blocked');
    if (!hasBlocked) {
      await this.run('ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0');
    }
    const hasBalance = userColumns.some((col) => col.name === 'balance');
    if (!hasBalance) {
      await this.run('ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0');
    }
    const hasUnpaidAttempts = userColumns.some((col) => col.name === 'unpaid_attempts');
    if (!hasUnpaidAttempts) {
      await this.run('ALTER TABLE users ADD COLUMN unpaid_attempts INTEGER DEFAULT 10');
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

    // Таблица отзывов
    await this.run(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_name TEXT NOT NULL,
        city_name TEXT NOT NULL,
        district_name TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        review_text TEXT NOT NULL,
        review_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Индекс для быстрого поиска отзывов по дате
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(review_date DESC)'
    );


    // Миграция: добавляем колонку image_path в существующую таблицу products при необходимости
    const hasImagePath = productColumns.some((col) => col.name === 'image_path');
    if (!hasImagePath) {
      await this.run('ALTER TABLE products ADD COLUMN image_path TEXT');
    }

    // Миграция: обновляем таблицу orders - добавляем новые поля
    const orderColumns = await this.db.all('PRAGMA table_info(orders)');
    const hasDistrictIdInOrders = orderColumns.some((col) => col.name === 'district_id');
    if (!hasDistrictIdInOrders) {
      await this.run('ALTER TABLE orders ADD COLUMN district_id INTEGER');
      // Обновляем существующие заказы - находим district_id по product_id
      const orders = await this.db.all('SELECT id, product_id FROM orders WHERE district_id IS NULL');
      for (const order of orders) {
        const product = await this.db.get('SELECT district_id FROM products WHERE id = ?', [order.product_id]);
        if (product && product.district_id) {
          await this.run('UPDATE orders SET district_id = ? WHERE id = ?', [product.district_id, order.id]);
        }
      }
    }
    const hasPromocodeId = orderColumns.some((col) => col.name === 'promocode_id');
    if (!hasPromocodeId) {
      await this.run('ALTER TABLE orders ADD COLUMN promocode_id INTEGER');
    }
    const hasDiscount = orderColumns.some((col) => col.name === 'discount');
    if (!hasDiscount) {
      await this.run('ALTER TABLE orders ADD COLUMN discount REAL DEFAULT 0');
    }
    const hasPrice = orderColumns.some((col) => col.name === 'price');
    if (!hasPrice) {
      await this.run('ALTER TABLE orders ADD COLUMN price REAL');
      // Обновляем существующие заказы - берем цену из total_price
      await this.run('UPDATE orders SET price = total_price WHERE price IS NULL');
    }
    const hasWarningSent = orderColumns.some((col) => col.name === 'warning_sent');
    if (!hasWarningSent) {
      console.log('[DB.init] Добавление колонки warning_sent в таблицу orders...');
      await this.run('ALTER TABLE orders ADD COLUMN warning_sent INTEGER DEFAULT 0');
      console.log('[DB.init] Колонка warning_sent добавлена в таблицу orders');
    }
    const hasExpiredNotificationSent = orderColumns.some((col) => col.name === 'expired_notification_sent');
    if (!hasExpiredNotificationSent) {
      console.log('[DB.init] Добавление колонки expired_notification_sent в таблицу orders...');
      await this.run('ALTER TABLE orders ADD COLUMN expired_notification_sent INTEGER DEFAULT 0');
      console.log('[DB.init] Колонка expired_notification_sent добавлена в таблицу orders');
    }

    // Миграция: добавляем колонку cards в существующую таблицу card_accounts при необходимости
    const cardAccountColumns = await this.db.all('PRAGMA table_info(card_accounts)');
    const hasCards = cardAccountColumns.some((col) => col.name === 'cards');
    if (!hasCards) {
      console.log('[DB.init] Добавление колонки cards в таблицу card_accounts...');
      await this.run('ALTER TABLE card_accounts ADD COLUMN cards TEXT');
      // Мигрируем существующие данные: преобразуем account_number в массив в поле cards
      const accounts = await this.db.all('SELECT id, account_number FROM card_accounts WHERE cards IS NULL');
      for (const account of accounts) {
        const cardsArray = [account.account_number];
        await this.run('UPDATE card_accounts SET cards = ? WHERE id = ?', [JSON.stringify(cardsArray), account.id]);
      }
      console.log('[DB.init] Колонка cards добавлена в таблицу card_accounts, данные мигрированы');
    }

    // Миграция: добавляем колонку district_id в существующую таблицу products при необходимости
    // Переиспользуем productColumns, объявленную выше
    const hasDistrictId = productColumns.some((col) => col.name === 'district_id');
    if (!hasDistrictId) {
      console.log('[DB.init] Добавление колонки district_id в таблицу products...');
      // SQLite не поддерживает ALTER TABLE ADD COLUMN с NOT NULL без значения по умолчанию
      // Поэтому сначала добавляем колонку как nullable
      await this.run('ALTER TABLE products ADD COLUMN district_id INTEGER');

      // Создаем дефолтный район для каждого города, если его нет
      const cities = await this.db.all('SELECT id FROM cities');
      for (const city of cities) {
        // Проверяем, есть ли уже районы для этого города
        const existingDistricts = await this.db.all('SELECT id FROM districts WHERE city_id = ?', [city.id]);
        if (existingDistricts.length === 0) {
          // Создаем дефолтный район "Центральный"
          await this.run('INSERT INTO districts (city_id, name) VALUES (?, ?)', [city.id, 'Центральный']);
        }
      }

      // Получаем первый район для каждого города и обновляем товары
      const districts = await this.db.all('SELECT id, city_id FROM districts');
      for (const district of districts) {
        await this.run('UPDATE products SET district_id = ? WHERE city_id = ? AND district_id IS NULL', [district.id, district.city_id]);
      }

      // Если остались товары без района, создаем для них дефолтный
      const productsWithoutDistrict = await this.db.all('SELECT DISTINCT city_id FROM products WHERE district_id IS NULL');
      for (const product of productsWithoutDistrict) {
        const defaultDistrict = await this.db.get('SELECT id FROM districts WHERE city_id = ? LIMIT 1', [product.city_id]);
        if (defaultDistrict) {
          await this.run('UPDATE products SET district_id = ? WHERE city_id = ? AND district_id IS NULL', [defaultDistrict.id, product.city_id]);
        }
      }

      console.log('[DB.init] Миграция district_id завершена.');
    }

    // Индексы для оптимизации
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_products_city_id ON products(city_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_products_district_id ON products(district_id)'
    );
    await this.run(
      'CREATE INDEX IF NOT EXISTS idx_districts_city_id ON districts(city_id)'
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

