import { reviewService } from '../../services/reviewService.js';

/**
 * Регистрирует обработчики отзывов
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerReviewsHandlers(bot) {
    // Обработка пагинации отзывов
    bot.action(/^reviews_page_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            await showReviews(ctx, page);
        } catch (error) {
            console.error('[ReviewsHandler] Ошибка при обработке пагинации отзывов:', error);
            await ctx.answerCbQuery('Ошибка при загрузке страницы');
        }
    });

    // Обработчик для текущей страницы (неактивная кнопка)
    bot.action('reviews_current', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('[ReviewsHandler] Ошибка при обработке reviews_current:', error);
        }
    });
}

/**
 * Показ отзывов с пагинацией
 */
export async function showReviews(ctx, page = 1) {
    try {
        console.log('[ReviewsHandler] Запрос отзывов, страница:', page);
        const { reviews, currentPage, totalPages } = await reviewService.getAll(page, 5);
        console.log('[ReviewsHandler] Получено отзывов:', reviews.length, 'Всего страниц:', totalPages);

        if (reviews.length === 0) {
            const text = '💌 Отзывы:\n\nПока нет отзывов.';
            const keyboard = {
                inline_keyboard: [
                    [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                ]
            };

            if (ctx.callbackQuery) {
                await ctx.editMessageText(text, { reply_markup: keyboard });
            } else {
                await ctx.reply(text, { reply_markup: keyboard });
            }
            return;
        }

        let text = '💌 Отзывы:\n\n';

        for (const review of reviews) {
            // Оценка в виде звёзд (1–5)
            const ratingNum = Math.min(5, Math.max(1, parseInt(review.rating, 10) || 0));
            const stars = '⭐️'.repeat(ratingNum);

            // Безопасное форматирование даты
            let formattedDate = review.review_date;
            if (review.review_date && typeof review.review_date === 'string') {
                try {
                    formattedDate = review.review_date.split('-').reverse().join('.');
                } catch (dateError) {
                    console.error('[ReviewsHandler] Ошибка при форматировании даты:', dateError);
                    formattedDate = review.review_date;
                }
            }

            text += `<b></b>Товар: ${review.product_name || 'Не указан'}\n`;
            text += `Дата: ${formattedDate}\n`;
            text += `Оценка: ${stars}\n`;
            text += `Отзыв: ${review.review_text || 'Нет текста'}\n\n`;
        }

        // Кнопки пагинации
        const keyboard = [];
        const navRow = [];

        if (currentPage > 1) {
            navRow.push({ text: '◀️', callback_data: `reviews_page_${currentPage - 1}` });
        }

        navRow.push({ text: `${currentPage} / ${totalPages}`, callback_data: 'reviews_current' });

        if (currentPage < totalPages) {
            navRow.push({ text: '▶️', callback_data: `reviews_page_${currentPage + 1}` });
        }

        if (navRow.length > 0) {
            keyboard.push(navRow);
        }

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    reply_markup: { inline_keyboard: keyboard }
                });
                await ctx.answerCbQuery(); // Подтверждаем обработку callback query
            } catch (error) {
                console.error('[ReviewsHandler] Ошибка при редактировании сообщения с отзывами:', error);
                try {
                    await ctx.reply(text, {
                        reply_markup: { inline_keyboard: keyboard }
                    });
                    await ctx.answerCbQuery();
                } catch (replyError) {
                    console.error('[ReviewsHandler] Ошибка при отправке нового сообщения с отзывами:', replyError);
                    await ctx.answerCbQuery('Ошибка при отображении отзывов');
                }
            }
        } else {
            await ctx.reply(text, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('[ReviewsHandler] Ошибка при показе отзывов:', error);
        console.error('[ReviewsHandler] Stack trace:', error.stack);
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('Ошибка при загрузке отзывов');
            }
            await ctx.reply('Произошла ошибка при загрузке отзывов. Попробуйте позже.');
        } catch (replyError) {
            console.error('[ReviewsHandler] Ошибка при отправке сообщения об ошибке:', replyError);
        }
    }
}
