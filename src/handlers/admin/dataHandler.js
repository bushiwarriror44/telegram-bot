import { exportProducts, exportPayments, exportPackagings, exportDatabase } from '../../utils/adminHelpers.js';
import { isAdmin } from './authHandler.js';

// Режимы импорта
export const importPaymentMode = new Map(); // userId -> true
export const importProductMode = new Map(); // userId -> true
export const databaseImportMode = new Map(); // userId -> true

/**
 * Регистрирует обработчики управления данными
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerDataHandlers(bot) {
    bot.action('admin_data', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showDataMenu(ctx);
    });

    bot.hears('Данные', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showDataMenu(ctx);
    });

    bot.action('import_payments', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        importPaymentMode.set(ctx.from.id, true);
        await ctx.reply(
            '📤 <b>Загрузка платежных адресов</b>\n\n' +
            '⚠️ <b>ВНИМАНИЕ!</b> Все существующие платежные методы и адреса будут удалены!\n\n' +
            'Отправьте JSON файл или текст в формате JSON.\n' +
            'Формат:\n' +
            '<pre>[\n' +
            '  {\n' +
            '    "name": "Bitcoin",\n' +
            '    "network": "BTC",\n' +
            '    "type": "crypto",\n' +
            '    "enabled": true,\n' +
            '    "address": "1c2b3a4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b"\n' +
            '  }\n' +
            ']</pre>\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('import_products', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        importProductMode.set(ctx.from.id, true);
        await ctx.reply(
            '📤 <b>Загрузка товаров</b>\n\n' +
            '⚠️ <b>ВНИМАНИЕ!</b> Все существующие товары будут удалены!\n\n' +
            'Отправьте JSON файл или текст в формате JSON.\n' +
            'Формат:\n' +
            '<pre>[\n' +
            '  {\n' +
            '    "city_name": "Москва",\n' +
            '    "name": "Товар 1",\n' +
            '    "description": "Описание",\n' +
            '    "price": 1000,\n' +
            '    "packaging_value": 1\n' +
            '  }\n' +
            ']</pre>\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('export_products', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await exportProducts(ctx, showDataMenu);
    });

    bot.action('export_payments', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await exportPayments(ctx, showDataMenu);
    });

    bot.action('export_packagings', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await exportPackagings(ctx, showDataMenu);
    });

    bot.action('export_database', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await exportDatabase(ctx, showDataMenu);
    });

    bot.action('import_database', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        databaseImportMode.set(ctx.from.id, true);
        await ctx.reply(
            '📥 <b>Загрузка базы данных</b>\n\n' +
            '⚠️ <b>ВНИМАНИЕ!</b> Текущая база данных будет заменена загруженной!\n' +
            'Резервная копия текущей БД будет создана автоматически.\n\n' +
            'Отправьте SQL файл базы данных.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });
}

/**
 * Показ меню управления данными
 */
export async function showDataMenu(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const text = `
💾 <b>Управление данными</b>

Данная настройка дает вам возможность загружать и выгружать все данные.

⚠️ <b>ВНИМАНИЕ! Осторожно!</b> При загрузке новых данных, все предыдущие данные будут стерты!

Выберите действие:
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [{ text: '📥 Выгрузить все товары', callback_data: 'export_products' }],
            [{ text: '📥 Выгрузить все платежные данные', callback_data: 'export_payments' }],
            [{ text: '📥 Выгрузить все фасовки', callback_data: 'export_packagings' }],
            [{ text: '📤 Загрузить готовые платежные адреса', callback_data: 'import_payments' }],
            [{ text: '📤 Загрузить готовые товары', callback_data: 'import_products' }],
            [{ text: '💾 ВЫГРУЗИТЬ БД', callback_data: 'export_database' }],
            [{ text: '📥 ЗАГРУЗИТЬ БД', callback_data: 'import_database' }],
            [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
        ]
    };

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            if (error.message && error.message.includes('message is not modified')) {
                return;
            }
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    } else {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    }
}
