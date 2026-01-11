import { reviewService } from '../../services/reviewService.js';
import { isAdmin } from './authHandler.js';

// Режимы работы с отзывами
export const reviewCreateMode = new Map(); // userId -> {step: 'product'|'rating'|'text'|'date', data: {}}
export const reviewImportMode = new Map(); // userId -> true

/**
 * Регистрирует обработчики отзывов
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerReviewsHandlers(bot) {
    bot.action('admin_reviews', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showReviewsAdmin(ctx);
    });

    bot.action('admin_review_create', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        reviewCreateMode.set(ctx.from.id, { step: 'product', data: {} });
        await ctx.reply(
            '✏️ <b>Создание отзыва вручную</b>\n\n' +
            'Введите название товара в формате:\n' +
            '<code>Город / Район / Товар фасовка</code>\n\n' +
            'Пример:\n' +
            '<code>Москва / Центр / Товар 1г</code>\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('admin_review_import', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        reviewImportMode.set(ctx.from.id, true);
        await ctx.reply(
            '📥 <b>Загрузка существующих отзывов</b>\n\n' +
            'Отправьте JSON файл с отзывами.\n\n' +
            'Формат:\n' +
            '<pre>[\n' +
            '  {\n' +
            '    "product_name": "Москва / Центр / Товар 1г",\n' +
            '    "city_name": "Москва",\n' +
            '    "district_name": "Центр",\n' +
            '    "rating": 5,\n' +
            '    "review_text": "Отличный товар!",\n' +
            '    "review_date": "2025-12-30"\n' +
            '  }\n' +
            ']</pre>\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('admin_review_delete_all', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            '⚠️ <b>Удаление всех отзывов</b>\n\n' +
            'Вы уверены, что хотите удалить все отзывы?\n\n' +
            'Это действие нельзя отменить!',
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Да, удалить все', callback_data: 'admin_review_delete_all_confirm' }],
                        [{ text: '❌ Отмена', callback_data: 'admin_reviews' }]
                    ]
                }
            }
        );
    });

    bot.action('admin_review_delete_all_confirm', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        try {
            await reviewService.deleteAll();
            await ctx.editMessageText('✅ Все отзывы успешно удалены!');
            await showReviewsAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action(/^review_rating_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const rating = parseInt(ctx.match[1]);
        const mode = reviewCreateMode.get(ctx.from.id);
        if (mode) {
            mode.data.rating = rating;
            mode.step = 'text';
            reviewCreateMode.set(ctx.from.id, mode);
            await ctx.editMessageText(
                '✏️ Введите текст отзыва:',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Отмена', callback_data: 'admin_reviews' }]
                        ]
                    }
                }
            );
        }
    });
}

/**
 * Показ меню управления отзывами
 */
export async function showReviewsAdmin(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    const reviews = await reviewService.getAll();
    const reviewCount = reviews.length;

    const text = `
💬 <b>Управление отзывами</b>

Всего отзывов: <b>${reviewCount}</b>

Выберите действие:
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [{ text: '➕ Создать отзыв вручную', callback_data: 'admin_review_create' }],
            [{ text: '📥 Загрузить существующие отзывы', callback_data: 'admin_review_import' }],
            [{ text: '🗑️ Удалить все отзывы', callback_data: 'admin_review_delete_all' }],
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
