import { cityService } from '../services/cityService.js';
import { productService } from '../services/productService.js';
import { paymentService } from '../services/paymentService.js';
import { packagingService } from '../services/packagingService.js';
import { database } from '../database/db.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Выгружает все товары в JSON формат
 * @param {Object} ctx - Контекст Telegraf
 * @param {Function} showDataMenu - Функция для показа меню данных
 * @returns {Promise<void>}
 */
export async function exportProducts(ctx, showDataMenu) {
    try {
        const cities = await cityService.getAll();
        const productsData = [];

        for (const city of cities) {
            const products = await productService.getByCityId(city.id);
            for (const product of products) {
                productsData.push({
                    city_name: city.name,
                    name: product.name,
                    description: product.description || '',
                    price: product.price,
                    packaging_value: product.packaging_value || null
                });
            }
        }

        const jsonData = JSON.stringify(productsData, null, 2);
        await ctx.reply('📥 <b>Выгрузка всех товаров</b>', { parse_mode: 'HTML' });
        await ctx.reply(`<pre>${jsonData}</pre>`, { parse_mode: 'HTML' });
        if (showDataMenu) {
            await showDataMenu(ctx);
        }
    } catch (error) {
        console.error('[AdminHelpers] Ошибка при выгрузке товаров:', error);
        await ctx.reply('❌ Ошибка при выгрузке товаров: ' + error.message);
    }
}

/**
 * Выгружает все платежные данные в JSON формат
 * @param {Object} ctx - Контекст Telegraf
 * @param {Function} showDataMenu - Функция для показа меню данных
 * @returns {Promise<void>}
 */
export async function exportPayments(ctx, showDataMenu) {
    try {
        const methods = await paymentService.getAllMethods(true);
        const paymentsData = [];

        for (const method of methods) {
            const address = await paymentService.getAddressForMethod(method.id);
            paymentsData.push({
                name: method.name,
                network: method.network,
                type: method.type || 'crypto',
                enabled: method.enabled === 1,
                address: address ? address.address : null
            });
        }

        const jsonData = JSON.stringify(paymentsData, null, 2);
        await ctx.reply('📥 <b>Выгрузка всех платежных данных</b>', { parse_mode: 'HTML' });
        await ctx.reply(`<pre>${jsonData}</pre>`, { parse_mode: 'HTML' });
        if (showDataMenu) {
            await showDataMenu(ctx);
        }
    } catch (error) {
        console.error('[AdminHelpers] Ошибка при выгрузке платежных данных:', error);
        await ctx.reply('❌ Ошибка при выгрузке платежных данных: ' + error.message);
    }
}

/**
 * Выгружает все фасовки в JSON формат
 * @param {Object} ctx - Контекст Telegraf
 * @param {Function} showDataMenu - Функция для показа меню данных
 * @returns {Promise<void>}
 */
export async function exportPackagings(ctx, showDataMenu) {
    try {
        const packagings = await packagingService.getAll();
        const packagingsData = packagings.map(p => ({
            value: p.value
        }));

        const jsonData = JSON.stringify(packagingsData, null, 2);
        await ctx.reply('📥 <b>Выгрузка всех фасовок</b>', { parse_mode: 'HTML' });
        await ctx.reply(`<pre>${jsonData}</pre>`, { parse_mode: 'HTML' });
        if (showDataMenu) {
            await showDataMenu(ctx);
        }
    } catch (error) {
        console.error('[AdminHelpers] Ошибка при выгрузке фасовок:', error);
        await ctx.reply('❌ Ошибка при выгрузке фасовок: ' + error.message);
    }
}

/**
 * Выгружает базу данных в SQL формат
 * @param {Object} ctx - Контекст Telegraf
 * @param {Function} showDataMenu - Функция для показа меню данных
 * @returns {Promise<void>}
 */
export async function exportDatabase(ctx, showDataMenu) {
    try {
        await ctx.reply('💾 Создание SQL дампа базы данных...');

        const dbPath = config.dbPath.startsWith('./') || config.dbPath.startsWith('../')
            ? join(__dirname, '../..', config.dbPath)
            : config.dbPath;

        // Получаем все таблицы
        const tables = await database.all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        );

        let sqlDump = '-- SQL Dump of Telegram Bot Database\n';
        sqlDump += `-- Generated: ${new Date().toISOString()}\n\n`;

        // Для каждой таблицы получаем структуру и данные
        for (const table of tables) {
            const tableName = table.name;

            // Получаем CREATE TABLE statement
            const createTable = await database.get(
                `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
                [tableName]
            );

            if (createTable && createTable.sql) {
                sqlDump += `-- Table: ${tableName}\n`;
                sqlDump += `${createTable.sql};\n\n`;
            }

            // Получаем все данные из таблицы
            const rows = await database.all(`SELECT * FROM ${tableName}`);

            if (rows.length > 0) {
                // Получаем названия колонок
                const columns = Object.keys(rows[0]);

                // Создаем INSERT statements
                for (const row of rows) {
                    const values = columns.map(col => {
                        const value = row[col];
                        if (value === null) return 'NULL';
                        if (typeof value === 'string') {
                            return `'${value.replace(/'/g, "''")}'`;
                        }
                        return value;
                    });
                    sqlDump += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
                }
                sqlDump += '\n';
            }
        }

        // Сохраняем во временный файл
        const tempFilePath = join(__dirname, '../../database', `backup_${Date.now()}.sql`);
        writeFileSync(tempFilePath, sqlDump, 'utf8');

        // Отправляем файл администратору
        await ctx.replyWithDocument(
            { source: tempFilePath, filename: `database_backup_${Date.now()}.sql` },
            {
                caption: '💾 <b>SQL дамп базы данных</b>\n\nФайл готов к загрузке.',
                parse_mode: 'HTML'
            }
        );

        // Удаляем временный файл
        unlinkSync(tempFilePath);

        // Показываем меню данных только если это был callback query
        if (ctx.callbackQuery && showDataMenu) {
            try {
                await showDataMenu(ctx);
            } catch (error) {
                // Если не удалось отредактировать сообщение, просто игнорируем ошибку
                console.error('[AdminHelpers] Ошибка при показе меню данных после выгрузки БД:', error.message);
            }
        }
    } catch (error) {
        console.error('[AdminHelpers] Ошибка при выгрузке БД:', error);
        await ctx.reply('❌ Ошибка при выгрузке БД: ' + error.message);
    }
}
