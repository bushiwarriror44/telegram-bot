import { statisticsService } from '../../services/statisticsService.js';
import { settingsService } from '../../services/settingsService.js';
import { isAdmin } from './authHandler.js';
import { formatPackaging } from '../../utils/packagingHelper.js';

/**
 * Регистрирует обработчики статистики
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerStatisticsHandlers(bot) {
    bot.action('admin_statistics', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showStatisticsAdmin(ctx);
    });

    bot.action('admin_stats', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ У вас нет доступа');
            return;
        }
        await ctx.answerCbQuery();
        await showStatisticsAdmin(ctx);
    });

    bot.hears('Статистика', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showStatisticsAdmin(ctx);
    });
}

/**
 * Показ статистики
 */
export async function showStatisticsAdmin(ctx) {
    if (!isAdmin(ctx.from.id)) {
        if (ctx.callbackQuery) {
            await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
        } else {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
        }
        return;
    }

    // Получаем все необходимые метрики
    const [
        userCount,
        totalProducts,
        totalProductsValue,
        averageOrderValue,
        totalSales,
        monthlySales,
        weeklySales,
        dailySales,
        mostPopular,
        leastPopular
    ] = await Promise.all([
        statisticsService.getUserCount(),
        statisticsService.getTotalProductsCount(),
        statisticsService.getTotalProductsValue(),
        statisticsService.getAverageOrderValue(),
        statisticsService.getTotalSales(),
        statisticsService.getMonthlySales(),
        statisticsService.getWeeklySales(),
        statisticsService.getDailySales(),
        statisticsService.getMostPopularProduct(),
        statisticsService.getLeastPopularProduct()
    ]);

    const currencySymbol = await settingsService.getCurrencySymbol();
    const formatCurrency = (value) => `${(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currencySymbol}`;

    const mostPopularText = mostPopular
        ? `${mostPopular.name}${mostPopular.packaging_value ? ` (${formatPackaging(mostPopular.packaging_value, mostPopular.packaging_unit)})` : ''} — ${mostPopular.view_count} просмотров`
        : 'Нет данных';

    const leastPopularText = leastPopular
        ? `${leastPopular.name}${leastPopular.packaging_value ? ` (${formatPackaging(leastPopular.packaging_value, leastPopular.packaging_unit)})` : ''} — ${leastPopular.view_count} просмотров`
        : 'Нет данных';

    const text = `
📊 <b>Статистика бота</b>

👥 <b>Пользователи</b>
• Всего пользователей: <b>${userCount}</b>

📦 <b>Товары</b>
• Количество позиций: <b>${totalProducts}</b>
• Товаров на общую сумму: <b>${formatCurrency(totalProductsValue)}</b>

🛒 <b>Покупки</b>
• Средний чек: <b>${formatCurrency(averageOrderValue)}</b>
• Продажи за все время: <b>${formatCurrency(totalSales)}</b>
• Продажи за этот месяц: <b>${formatCurrency(monthlySales)}</b>
• Продажи за эту неделю: <b>${formatCurrency(weeklySales)}</b>
• Продажи за сегодня: <b>${formatCurrency(dailySales)}</b>

🔥 <b>Популярность товаров</b>
• Самый популярный товар: <b>${mostPopularText}</b>
• Самый непопулярный товар: <b>${leastPopularText}</b>
    `.trim();

    const replyMarkup = {
        inline_keyboard: [
            [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
        ]
    };

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        } catch (error) {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        }
    } else {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
    }
}
