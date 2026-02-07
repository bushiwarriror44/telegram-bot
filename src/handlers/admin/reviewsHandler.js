import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { reviewService } from '../../services/reviewService.js';
import { productService } from '../../services/productService.js';
import { settingsService } from '../../services/settingsService.js';
import { formatPackaging } from '../../utils/packagingHelper.js';
import { isAdmin } from './authHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Режимы работы с отзывами
export const reviewCreateMode = new Map(); // userId -> {step: 'product'|'rating'|'text'|'date', data: {}}
export const reviewImportMode = new Map(); // userId -> true
export const reviewDisplayCountEditMode = new Map(); // userId -> true (ввод числа для кнопки «Отзывы»)

/** Перемешивает массив (Fisher–Yates) */
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Случайная дата от 1-го числа месяца до текущей даты включительно (YYYY-MM-DD) */
function randomDateUpToToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const day = today > 0 ? 1 + Math.floor(Math.random() * today) : 1;
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Генерирует 50 отзывов на текущий месяц:
 * - Товар/город/район — случайно из каталога админки
 * - Дата — случайный день от 1-го до текущей даты включительно
 * - Оценка: 50% — 4, 25% — 3, 25% — 5
 * - Текст — из JSON (50 строк)
 * @returns {Promise<number>} количество созданных отзывов
 */
async function generateMonthReviews() {
    const products = await productService.getProductsWithPlaceNames();
    if (!products || products.length === 0) return 0;

    // При повторном нажатии — перегенерировать заново (удаляем все отзывы)
    await reviewService.deleteAll();

    const jsonPath = join(__dirname, '../../data/reviewTexts.json');
    if (!existsSync(jsonPath)) {
        throw new Error('Файл с текстами отзывов не найден: data/reviewTexts.json');
    }
    const texts = JSON.parse(readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(texts) || texts.length < 50) {
        throw new Error('В reviewTexts.json должно быть не менее 50 строк отзывов');
    }

    const ratings = [
        ...Array(25).fill(4),
        ...Array(13).fill(3),
        ...Array(12).fill(5)
    ];
    const shuffledTexts = shuffleArray(texts.slice(0, 50));
    const shuffledRatings = shuffleArray(ratings);

    for (let i = 0; i < 50; i++) {
        const place = products[Math.floor(Math.random() * products.length)];
        // Строка товара: название + фасовка (с единицей) + иконка/декор фасовки
        let productDisplay = place.product_name || '';
        if (place.packaging_value != null && place.packaging_value !== '') {
            const packagingStr = formatPackaging(place.packaging_value, place.packaging_unit || 'g');
            const decor = place.packaging_label ? ` ${place.packaging_label}` : '';
            productDisplay += ` ${packagingStr}${decor}`;
        }
        const productName = `${productDisplay} / ${place.city_name} / ${place.district_name}`;
        const reviewText = shuffledTexts[i];
        const rating = shuffledRatings[i];
        const reviewDate = randomDateUpToToday();
        await reviewService.create(
            productName,
            place.city_name,
            place.district_name,
            rating,
            reviewText,
            reviewDate
        );
    }
    await settingsService.set('reviews_last_generated_at', new Date().toISOString());
    return 50;
}

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

    bot.action('admin_review_delete_generated', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            '🗑️ <b>Удаление сгенерированных отзывов</b>\n\n' +
            'Будут удалены отзывы за текущий месяц с датой не позже сегодня.\n\n' +
            'Продолжить?',
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Да, удалить сгенерированные', callback_data: 'admin_review_delete_generated_confirm' }],
                        [{ text: '❌ Отмена', callback_data: 'admin_reviews' }]
                    ]
                }
            }
        );
    });

    bot.action('admin_review_delete_generated_confirm', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        try {
            const deleted = await reviewService.deleteGeneratedReviews();
            await ctx.editMessageText(`✅ Удалено сгенерированных отзывов: <b>${deleted}</b>`, { parse_mode: 'HTML' });
            await showReviewsAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_review_generate_month', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.answerCbQuery();
        try {
            const created = await generateMonthReviews();
            if (created === 0) {
                await ctx.reply(
                    '❌ Нет товаров в каталоге. Добавьте товары (город / район / товар), затем повторите генерацию.',
                    { parse_mode: 'HTML' }
                );
                return;
            }
            await ctx.reply(`✅ Сгенерировано отзывов на месяц: <b>${created}</b>`, { parse_mode: 'HTML' });
            await showReviewsAdmin(ctx);
        } catch (error) {
            console.error('[ReviewsAdmin] Ошибка генерации отзывов на месяц:', error);
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_reviews_display_count', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.answerCbQuery();
        reviewDisplayCountEditMode.set(ctx.from.id, true);
        const current = await settingsService.getReviewsDisplayCount();
        await ctx.reply(
            `🔢 <b>Число на кнопке «Отзывы»</b>\n\n` +
            `Сейчас в главном меню отображается: <b>Отзывы (${current})</b>\n\n` +
            `Введите новое число (целое, например 561):`,
            { parse_mode: 'HTML' }
        );
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

    const result = await reviewService.getAll(1, 1);
    const reviewCount = result?.total ?? 0;
    const lastGeneratedRaw = await settingsService.get('reviews_last_generated_at', null);
    let lastGeneratedLine = '';
    if (lastGeneratedRaw) {
        try {
            const d = new Date(lastGeneratedRaw);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            lastGeneratedLine = `\nПоследний раз отзывы были сгенерированы: <b>${day}.${month}.${year}</b>\n`;
        } catch (_) {
            lastGeneratedLine = '\nПоследний раз отзывы были сгенерированы: —\n';
        }
    } else {
        lastGeneratedLine = '\nПоследний раз отзывы были сгенерированы: ещё не генерировались\n';
    }
    const reviewsDisplayCount = await settingsService.getReviewsDisplayCount();

    const text = `
💬 <b>Управление отзывами</b>

Всего отзывов: <b>${reviewCount}</b>${lastGeneratedLine}

Выберите действие:
    `.trim();

    const keyboard = {
        inline_keyboard: [
            [{ text: '➕ Создать отзыв вручную', callback_data: 'admin_review_create' }],
            [{ text: '📥 Загрузить существующие отзывы', callback_data: 'admin_review_import' }],
            [{ text: '📅 Сгенерировать отзывы на месяц', callback_data: 'admin_review_generate_month' }],
            [{ text: '🗑️ Удалить сгенерированные отзывы', callback_data: 'admin_review_delete_generated' }],
            [{ text: '🗑️ Удалить все отзывы', callback_data: 'admin_review_delete_all' }],
            [{ text: `🔢 Число на кнопке «Отзывы» (${reviewsDisplayCount})`, callback_data: 'admin_reviews_display_count' }],
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
