import { cityService } from '../../services/cityService.js';
import { districtService } from '../../services/districtService.js';
import { productService } from '../../services/productService.js';
import { packagingService } from '../../services/packagingService.js';
import { settingsService } from '../../services/settingsService.js';
import { isAdmin } from './authHandler.js';

// Шаблоны товаров по умолчанию
const PRODUCT_TEMPLATES = [
    { id: 1, name: 'Яблоки' },
    { id: 2, name: 'Груши' },
    { id: 3, name: 'Персики' }
];

// Режим загрузки фото товара
export const productImageUploadMode = new Map(); // userId -> productId

/**
 * Регистрирует обработчики управления товарами
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerProductsHandlers(bot) {
    bot.action('admin_products', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showProductsAdmin(ctx);
    });

    bot.hears('Управление товарами', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showProductsAdmin(ctx);
    });

    bot.action(/^admin_products_city_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        await showDistrictsForProducts(ctx, cityId);
    });

    bot.action(/^admin_products_district_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        await showDistrictProductsAdmin(ctx, districtId);
    });

    bot.action(/^admin_product_add_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        const district = await districtService.getById(districtId);
        const city = await cityService.getById(district.city_id);
        await ctx.editMessageText(
            `Введите данные нового товара.\n\nДоступные шаблоны названий:\n` +
            PRODUCT_TEMPLATES.map(t => `${t.id}) ${t.name}`).join('\n') +
            `\n\nВы можете указать либо название товара, либо ID шаблона.\n` +
            `Также обязательно укажите фасовку (например: 0.25, 0.5, 1, 2 и т.д.).\n\n` +
            `Формат: <code>/addproduct ${districtId} НазваниеИЛИ_ID|Описание|Цена|Фасовка</code>\n\n` +
            `Пример c шаблоном: /addproduct ${districtId} 1|Сладкие красные яблоки|500|1\n` +
            `Пример с произвольным названием: /addproduct ${districtId} Манго|Спелое манго|900|0.5\n\n` +
            `Район: ${district.name}, Город: ${city.name}`,
            { parse_mode: 'HTML' }
        );
    });

    bot.command('addproduct', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1);
        const districtId = parseInt(args[0]);
        const data = args.slice(1).join(' ').split('|');

        if (isNaN(districtId)) {
            await ctx.reply('❌ Неверный формат districtId.\nФормат: /addproduct districtId НазваниеИЛИ_ID|Описание|Цена|Фасовка');
            return;
        }

        const district = await districtService.getById(districtId);
        if (!district) {
            await ctx.reply('❌ Район не найден.');
            return;
        }

        const cityId = district.city_id;

        if (data.length < 4) {
            await ctx.reply('❌ Неверный формат.\nФормат: /addproduct cityId НазваниеИЛИ_ID|Описание|Цена|Фасовка');
            return;
        }

        const [rawName, description, price, packagingStr] = data;
        const priceNum = parseFloat(price);
        const packagingValue = parseFloat(
            (packagingStr || '').toString().replace(',', '.')
        );

        if (isNaN(priceNum)) {
            await ctx.reply('❌ Цена должна быть числом.');
            return;
        }

        if (isNaN(packagingValue) || packagingValue <= 0) {
            await ctx.reply('❌ Фасовка должна быть положительным числом.\nПример: 0.25, 0.5, 1, 2 и т.д.');
            return;
        }

        // Определяем название товара: либо шаблон по ID, либо как есть
        let name = rawName.trim();
        const templateId = parseInt(rawName);
        if (!isNaN(templateId)) {
            const template = PRODUCT_TEMPLATES.find((t) => t.id === templateId);
            if (!template) {
                await ctx.reply('❌ Неизвестный ID шаблона товара. Проверьте список шаблонов в подсказке /admin.');
                return;
            }
            name = template.name;
        }

        try {
            let packaging = await packagingService.getByValue(packagingValue);
            if (!packaging) {
                await ctx.reply(
                    '❌ Указанная фасовка не найдена.\n' +
                    'Сначала добавьте её командой: /addpack значение (например: /addpack 0.35)'
                );
                return;
            }

            await productService.create(
                cityId,
                districtId,
                name,
                description.trim(),
                priceNum,
                packaging.id,
                null // imagePath будет null при создании через команду
            );
            await ctx.reply(`✅ Товар "${name}" успешно добавлен!`);
            await showDistrictProductsAdmin(ctx, districtId);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action(/^admin_product_delete_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        const products = await productService.getByDistrictId(districtId);

        if (products.length === 0) {
            await ctx.editMessageText('Нет товаров для удаления.');
            return;
        }

        const district = await districtService.getById(districtId);
        const city = await cityService.getById(district.city_id);
        const keyboard = products.map(product => [
            { text: `🗑️ ${product.name}`, callback_data: `admin_product_del_${product.id}_${districtId}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: `admin_products_district_${districtId}` }]);

        await ctx.editMessageText('Выберите товар для удаления:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_product_del_(\d+)_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const productId = parseInt(ctx.match[1]);
        const districtId = parseInt(ctx.match[2]);

        try {
            await productService.delete(productId);
            await ctx.editMessageText('✅ Товар успешно удален!');
            await showDistrictProductsAdmin(ctx, districtId);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    // Редактирование товара
    bot.action(/^admin_product_edit_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        const products = await productService.getByDistrictId(districtId);

        if (products.length === 0) {
            await ctx.editMessageText('Нет товаров для редактирования.');
            return;
        }

        const keyboard = products.map(product => [
            { text: `✏️ ${product.name}`, callback_data: `admin_product_edit_select_${product.id}` }
        ]);
        const district = await districtService.getById(districtId);
        const city = await cityService.getById(district.city_id);
        keyboard.push([{ text: '◀️ Назад', callback_data: `admin_products_district_${districtId}` }]);

        await ctx.editMessageText('Выберите товар для редактирования:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_product_edit_select_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const productId = parseInt(ctx.match[1]);
        const product = await productService.getById(productId);

        if (!product) {
            await ctx.reply('Товар не найден.');
            return;
        }

        const district = await districtService.getById(product.district_id);
        const city = await cityService.getById(product.city_id);

        const currencySymbol = await settingsService.getCurrencySymbol();
        const text = `
✏️ <b>Редактирование товара: ${product.name}</b>

Текущие данные:
• Название: ${product.name}
• Описание: ${product.description || 'Отсутствует'}
• Цена: ${product.price} ${currencySymbol}
• Фасовка: ${product.packaging_value || 'Не указана'} кг
• Фото: ${product.image_path ? '✅ Загружено' : '❌ Нет фото'}

Выберите действие:
        `.trim();

        const keyboard = [
            [{ text: '📷 Загрузить/Изменить фото', callback_data: `admin_product_upload_photo_${product.id}` }],
            [{ text: '◀️ Назад к товарам', callback_data: `admin_products_district_${product.district_id}` }]
        ];

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_product_upload_photo_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const productId = parseInt(ctx.match[1]);
        productImageUploadMode.set(ctx.from.id, productId);
        await ctx.reply(
            '📷 <b>Загрузка фото товара</b>\n\n' +
            'Отправьте фото для товара. Фото будет сохранено и отображаться при просмотре товара.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });
}

/**
 * Показ меню управления товарами
 */
export async function showProductsAdmin(ctx) {
    const cities = await cityService.getAll();

    const text = `
📦 <b>Управление товарами</b>

Выберите город для управления товарами:
    `.trim();

    const keyboard = cities.map(city => [
        { text: `🏙️ ${city.name}`, callback_data: `admin_products_city_${city.id}` }
    ]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_panel' }]);

    const replyMarkup = { inline_keyboard: keyboard };

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

/**
 * Показ районов для выбора товаров
 */
export async function showDistrictsForProducts(ctx, cityId) {
    const city = await cityService.getById(cityId);
    if (!city) {
        await ctx.reply('Город не найден.');
        return;
    }

    const districts = await districtService.getByCityId(cityId);

    const text = `
📦 <b>Управление товарами</b>

Город: <b>${city.name}</b>

Выберите район:
    `.trim();

    const keyboard = districts.map(district => [
        { text: `📍 ${district.name}`, callback_data: `admin_products_district_${district.id}` }
    ]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_products' }]);

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } else {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }
}

/**
 * Показ товаров в районе
 */
export async function showDistrictProductsAdmin(ctx, districtId) {
    const district = await districtService.getById(districtId);
    if (!district) {
        await ctx.reply('Район не найден.');
        return;
    }

    const city = await cityService.getById(district.city_id);
    const products = await productService.getByDistrictId(districtId);

    const currencySymbol = await settingsService.getCurrencySymbol();
    const text = `
📦 <b>Товары в районе: ${district.name} (${city.name})</b>

${products.map(p => {
        const packagingLabel = p.packaging_value ? ` (${p.packaging_value} кг)` : '';
        return `• ${p.name}${packagingLabel} - ${p.price} ${currencySymbol}`;
    }).join('\n') || 'Товаров пока нет'}
    `.trim();

    const keyboard = [
        [{ text: '➕ Добавить товар', callback_data: `admin_product_add_${districtId}` }],
        [{ text: '✏️ Редактировать товар', callback_data: `admin_product_edit_${districtId}` }],
        [{ text: '🗑️ Удалить товар', callback_data: `admin_product_delete_${districtId}` }],
        [{ text: '◀️ Назад к районам', callback_data: `admin_products_city_${city.id}` }]
    ];

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } catch (error) {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    } else {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    }
}
