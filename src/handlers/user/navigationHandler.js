import { userService } from '../../services/userService.js';
import { cityService } from '../../services/cityService.js';
import { settingsService } from '../../services/settingsService.js';
import { showCitiesMenu, showDistrictsMenu, showProductsMenu, showProductDetails } from './catalogHandler.js';

/**
 * Регистрирует обработчики навигации (back кнопки)
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerNavigationHandlers(bot) {
    // Вернуться к городам (раньше было "к витрине", теперь сразу к городам)
    bot.action('back_to_storefront', async (ctx) => {
        try {
            await showCitiesMenu(ctx);
        } catch (error) {
            console.error('[NavigationHandler] Ошибка при возврате к городам:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    });

    // Вернуться к городам
    bot.action('back_to_cities', async (ctx) => {
        try {
            await showCitiesMenu(ctx);
        } catch (error) {
            // Если не удалось изменить сообщение, отправляем новое
            const cityIcon = await settingsService.getCityIcon();
            const displayIcon = (cityIcon === '' || cityIcon === 'NONE') ? '' : `${cityIcon} `;
            await ctx.reply('🛍 Каталог товаров:', {
                reply_markup: {
                    inline_keyboard: (await cityService.getAll()).map(city => [
                        { text: `${displayIcon}${city.name}`, callback_data: `city_${city.id}` }
                    ])
                }
            });
        }
    });

    // Вернуться к районам
    bot.action(/^back_to_districts_(\d+)$/, async (ctx) => {
        const cityId = parseInt(ctx.match[1]);
        try {
            await showDistrictsMenu(ctx, cityId);
        } catch (error) {
            await ctx.reply('Ошибка при загрузке районов. Попробуйте снова.');
        }
    });

    // Вернуться к товарам
    bot.action(/^back_to_products_(\d+)$/, async (ctx) => {
        const districtId = parseInt(ctx.match[1]);
        try {
            await showProductsMenu(ctx, districtId);
        } catch (error) {
            await ctx.reply('Ошибка при загрузке товаров. Попробуйте снова.');
        }
    });

    // Вернуться к деталям товара
    bot.action(/^back_to_product_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        try {
            await showProductDetails(ctx, productId);
        } catch (error) {
            await ctx.reply('Ошибка при загрузке товара. Попробуйте снова.');
        }
    });
}
