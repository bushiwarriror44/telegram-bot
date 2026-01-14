import { cityService } from '../../services/cityService.js';
import { districtService } from '../../services/districtService.js';
import { productService } from '../../services/productService.js';
import { packagingService } from '../../services/packagingService.js';
import { settingsService } from '../../services/settingsService.js';
import { isAdmin } from './authHandler.js';

// Импортируем предустановленные товары из mockData
import { getMockProducts, mockProducts } from '../../utils/mockData.js';

// Шаблоны товаров по умолчанию
const PRODUCT_TEMPLATES = [
    { id: 1, name: 'Яблоки' },
    { id: 2, name: 'Груши' },
    { id: 3, name: 'Персики' }
];

// Режим загрузки фото товара
export const productImageUploadMode = new Map(); // userId -> productId

// Режимы добавления предустановленных товаров
export const predefinedProductSelectMode = new Map(); // userId -> true (выбор предустановленного товара)
export const predefinedProductCityMode = new Map(); // userId -> { productName, description, price } (выбор города)
export const predefinedProductDistrictMode = new Map(); // userId -> { productName, description, price, cityId, cityName } (выбор района)
export const predefinedProductAddMode = new Map(); // userId -> 'name' | 'description' | 'price' (добавление нового предустановленного товара)
export const predefinedProductAddSource = new Map(); // userId -> 'settings' | 'products' (источник вызова добавления товара)

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

            const newProduct = await productService.create(
                cityId,
                districtId,
                name,
                description.trim(),
                priceNum,
                packaging.id,
                null // imagePath будет null при создании через команду
            );
            await ctx.reply(
                `✅ Товар "${name}" успешно добавлен!\n\n` +
                `📷 <b>Добавление изображения товара:</b>\n\n` +
                `Чтобы добавить изображение для товара:\n\n` +
                `1️⃣ Перейдите в список товаров района\n` +
                `2️⃣ Нажмите на кнопку "✏️ Редактировать" рядом с товаром\n` +
                `3️⃣ Нажмите на кнопку "📷 Загрузить/Изменить фото"\n` +
                `4️⃣ Следуйте инструкциям для загрузки изображения\n\n` +
                `<b>Или используйте кнопку ниже для быстрого перехода:</b>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📷 Загрузить изображение', callback_data: `admin_product_upload_photo_${newProduct.id}` }],
                            [{ text: '📦 К списку товаров', callback_data: `admin_products_district_${districtId}` }]
                        ]
                    }
                }
            );
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
        const hasImage = product.image_path ? true : false;
        const imageStatus = hasImage ? '✅ Загружено' : '❌ Нет фото';
        const imageInstructions = hasImage 
            ? '' 
            : '\n\n📷 <b>Как добавить изображение:</b>\n' +
              '1. Нажмите на кнопку "📷 Загрузить/Изменить фото" ниже\n' +
              '2. Следуйте инструкциям для загрузки изображения\n' +
              '3. Отправьте изображение как фото (не как документ)';
        
        const text = `
✏️ <b>Редактирование товара: ${product.name}</b>

Текущие данные:
• Название: ${product.name}
• Описание: ${product.description || 'Отсутствует'}
• Цена: ${product.price} ${currencySymbol}
• Фасовка: ${product.packaging_value || 'Не указана'} кг
• Фото: ${imageStatus}${imageInstructions}

Выберите действие:
        `.trim();

        const keyboard = [
            [{ text: hasImage ? '📷 Изменить фото' : '📷 Загрузить фото', callback_data: `admin_product_upload_photo_${product.id}` }],
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
            '📷 <b>Загрузка изображения товара</b>\n\n' +
            '<b>Инструкция по загрузке изображения:</b>\n\n' +
            '1️⃣ <b>Подготовьте изображение:</b>\n' +
            '   • Формат: JPG, PNG или другой поддерживаемый формат\n' +
            '   • Рекомендуемый размер: не более 10 МБ\n' +
            '   • Рекомендуемое разрешение: от 800x800 до 2000x2000 пикселей\n\n' +
            '2️⃣ <b>Отправьте изображение:</b>\n' +
            '   • Нажмите на кнопку 📎 (скрепка) в поле ввода сообщения\n' +
            '   • Выберите "Фото" или "Галерея"\n' +
            '   • Выберите изображение из галереи или сделайте новое фото\n' +
            '   • Отправьте изображение в этот чат\n\n' +
            '3️⃣ <b>Подтверждение:</b>\n' +
            '   • После отправки изображение будет автоматически сохранено\n' +
            '   • Вы получите подтверждение об успешной загрузке\n\n' +
            '⚠️ <b>Важно:</b> Отправляйте изображение как <b>фото</b>, а не как документ!\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    // Обработчик для добавления предустановленного товара
    bot.action('admin_products_add_predefined', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPredefinedProducts(ctx);
    });

    // Обработчик для выбора предустановленного товара
    bot.action(/^admin_predefined_product_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const productIndex = parseInt(ctx.match[1]);
        const products = getMockProducts();
        if (productIndex < 0 || productIndex >= products.length) {
            await ctx.answerCbQuery('❌ Товар не найден');
            return;
        }
        const product = products[productIndex];
        predefinedProductSelectMode.set(ctx.from.id, true);
        predefinedProductCityMode.set(ctx.from.id, {
            name: product.name,
            description: product.description,
            price: product.price
        });
        await showCitiesForPredefinedProduct(ctx);
    });

    // Обработчик для выбора города для предустановленного товара
    bot.action(/^admin_predefined_city_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        const city = await cityService.getById(cityId);
        if (!city) {
            await ctx.answerCbQuery('❌ Город не найден');
            return;
        }
        const productData = predefinedProductCityMode.get(ctx.from.id);
        if (!productData) {
            await ctx.answerCbQuery('❌ Данные товара не найдены');
            return;
        }
        predefinedProductCityMode.delete(ctx.from.id);
        predefinedProductDistrictMode.set(ctx.from.id, {
            ...productData,
            cityId: city.id,
            cityName: city.name
        });
        await showDistrictsForPredefinedProduct(ctx, city.id);
    });

    // Обработчик для выбора района для предустановленного товара
    bot.action(/^admin_predefined_district_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        const district = await districtService.getById(districtId);
        if (!district) {
            await ctx.answerCbQuery('❌ Район не найден');
            return;
        }
        const productData = predefinedProductDistrictMode.get(ctx.from.id);
        if (!productData) {
            await ctx.answerCbQuery('❌ Данные товара не найдены');
            return;
        }
        await placePredefinedProduct(ctx, districtId, productData);
    });

    // Обработчик для ввода города вручную
    bot.action('admin_predefined_city_manual', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        predefinedProductSelectMode.set(ctx.from.id, 'city_input');
        await ctx.editMessageText(
            '✏️ <b>Ввод города</b>\n\n' +
            'Введите название города. Если города нет в списке, он будет создан автоматически.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    // Обработчик для ввода района вручную
    bot.action('admin_predefined_district_manual', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const productData = predefinedProductDistrictMode.get(ctx.from.id);
        if (!productData) {
            await ctx.answerCbQuery('❌ Данные товара не найдены');
            return;
        }
        predefinedProductSelectMode.set(ctx.from.id, 'district_input');
        await ctx.editMessageText(
            '✏️ <b>Ввод района</b>\n\n' +
            `Город: <b>${productData.cityName}</b>\n\n` +
            'Введите название района. Если района нет в списке, он будет создан автоматически.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    // Обработчик для добавления нового предустановленного товара
    bot.action('admin_predefined_add_new', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        predefinedProductAddMode.set(ctx.from.id, 'name');
        // Определяем источник вызова по callback_data предыдущего сообщения
        // Если это из меню управления (admin_predefined_products), то source = 'settings'
        // Если это из списка товаров (admin_products_add_predefined), то source = 'products'
        let source = 'products'; // По умолчанию из товаров
        if (ctx.callbackQuery?.message?.reply_markup?.inline_keyboard) {
            const hasSettingsButton = ctx.callbackQuery.message.reply_markup.inline_keyboard.some(
                row => row.some(btn => btn.callback_data === 'admin_predefined_products' || btn.callback_data === 'admin_settings')
            );
            if (hasSettingsButton) {
                source = 'settings';
            }
        }
        predefinedProductAddSource.set(ctx.from.id, source);
        await ctx.answerCbQuery();
        try {
            await ctx.editMessageText(
                '➕ <b>Добавление нового предустановленного товара</b>\n\n' +
                'Введите название товара:\n\n' +
                'Для отмены отправьте /cancel',
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            await ctx.reply(
                '➕ <b>Добавление нового предустановленного товара</b>\n\n' +
                'Введите название товара:\n\n' +
                'Для отмены отправьте /cancel',
                { parse_mode: 'HTML' }
            );
        }
    });

    // Обработчик для просмотра списка предустановленных товаров
    bot.action('admin_predefined_list', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.answerCbQuery();
        await showPredefinedProductsList(ctx);
    });

    // Обработчик для удаления предустановленного товара
    bot.action('admin_predefined_delete', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.answerCbQuery();
        await showPredefinedProductsDeleteMenu(ctx);
    });

    // Обработчик для подтверждения удаления товара
    bot.action(/^admin_predefined_delete_confirm_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const productIndex = parseInt(ctx.match[1]);
        const products = getMockProducts();
        if (productIndex < 0 || productIndex >= products.length) {
            await ctx.answerCbQuery('❌ Товар не найден');
            return;
        }
        const product = products[productIndex];
        const { removeMockProduct } = await import('../../utils/mockData.js');
        const removed = removeMockProduct(product.name);
        if (removed) {
            await ctx.answerCbQuery('✅ Товар удален!');
            await showPredefinedProductsManagement(ctx);
        } else {
            await ctx.answerCbQuery('❌ Ошибка при удалении');
        }
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
    keyboard.push([{ text: '➕ Добавить из шаблона', callback_data: 'admin_products_add_predefined' }]);
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
    keyboard.push([{ text: '➕ Добавить новый предустановленный товар', callback_data: 'admin_predefined_add_new' }]);
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

/**
 * Показ списка предустановленных товаров
 */
export async function showPredefinedProducts(ctx) {
    const products = getMockProducts();
    const currencySymbol = await settingsService.getCurrencySymbol();

    const text = `
📦 <b>Предустановленные товары</b>

Выберите товар для добавления:
    `.trim();

    const keyboard = products.map((product, index) => [
        {
            text: `${product.name} - ${product.price.toLocaleString('ru-RU')} ${currencySymbol}`,
            callback_data: `admin_predefined_product_${index}`
        }
    ]);
    keyboard.push([{ text: '➕ Добавить новый предустановленный товар', callback_data: 'admin_predefined_add_new' }]);
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
 * Показ городов для выбора места размещения предустановленного товара
 */
export async function showCitiesForPredefinedProduct(ctx) {
    const cities = await cityService.getAll();
    const productData = predefinedProductCityMode.get(ctx.from.id);

    if (!productData) {
        await ctx.reply('❌ Ошибка: данные товара не найдены');
        return;
    }

    const text = `
📦 <b>Выбран товар: ${productData.name}</b>
💰 Цена: ${productData.price.toLocaleString('ru-RU')} ${await settingsService.getCurrencySymbol()}

Выберите город для размещения товара:
(Если города нет в списке, введите его название)
    `.trim();

    const keyboard = cities.map(city => [
        { text: `🏙️ ${city.name}`, callback_data: `admin_predefined_city_${city.id}` }
    ]);
    keyboard.push([{ text: '✏️ Ввести город вручную', callback_data: 'admin_predefined_city_manual' }]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_products_add_predefined' }]);

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
 * Показ районов для выбора места размещения предустановленного товара
 */
export async function showDistrictsForPredefinedProduct(ctx, cityId) {
    const city = await cityService.getById(cityId);
    if (!city) {
        await ctx.reply('Город не найден.');
        return;
    }

    const districts = await districtService.getByCityId(cityId);
    const productData = predefinedProductDistrictMode.get(ctx.from.id);

    if (!productData) {
        await ctx.reply('❌ Ошибка: данные товара не найдены');
        return;
    }

    const text = `
📦 <b>Выбран товар: ${productData.name}</b>
🏙️ <b>Город: ${city.name}</b>

Выберите район для размещения товара:
(Если района нет в списке, введите его название)
    `.trim();

    const keyboard = districts.map(district => [
        { text: `📍 ${district.name}`, callback_data: `admin_predefined_district_${district.id}` }
    ]);
    keyboard.push([{ text: '✏️ Ввести район вручную', callback_data: 'admin_predefined_district_manual' }]);
    keyboard.push([{ text: '◀️ Назад к городам', callback_data: 'admin_products_add_predefined' }]);

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
 * Размещение предустановленного товара в районе
 */
export async function placePredefinedProduct(ctx, districtId, productData) {
    try {
        const district = await districtService.getById(districtId);
        if (!district) {
            await ctx.reply('❌ Район не найден');
            return;
        }

        // Получаем фасовку по умолчанию (1 кг)
        let packaging = await packagingService.getByValue(1);
        if (!packaging) {
            // Если фасовки нет, создаем её
            packaging = await packagingService.create(1);
        }

        await productService.create(
            district.city_id,
            districtId,
            productData.name,
            productData.description,
            productData.price,
            packaging.id,
            null // imagePath
        );

        predefinedProductDistrictMode.delete(ctx.from.id);
        predefinedProductSelectMode.delete(ctx.from.id);

        if (ctx.callbackQuery) {
            await ctx.answerCbQuery('✅ Товар успешно добавлен!');
        }
        await showDistrictProductsAdmin(ctx, districtId);
    } catch (error) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery(`❌ Ошибка: ${error.message}`);
        } else {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
        console.error('[ProductsHandler] Ошибка при размещении предустановленного товара:', error);
    }
}

/**
 * Показ списка всех предустановленных товаров
 */
export async function showPredefinedProductsList(ctx) {
    const products = getMockProducts();
    const currencySymbol = await settingsService.getCurrencySymbol();

    if (products.length === 0) {
        const text = `
📦 <b>Предустановленные товары</b>

Товаров пока нет.
        `.trim();

        const keyboard = [
            [{ text: '➕ Добавить товар', callback_data: 'admin_predefined_add_new' }],
            [{ text: '◀️ Назад', callback_data: 'admin_predefined_products' }]
        ];

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
        return;
    }

    const text = `
📦 <b>Предустановленные товары</b>

Список всех товаров:
${products.map((product, index) =>
        `${index + 1}. <b>${product.name}</b>\n   Описание: ${product.description}\n   Цена: ${product.price.toLocaleString('ru-RU')} ${currencySymbol}`
    ).join('\n\n')}
    `.trim();

    const keyboard = [
        [{ text: '➕ Добавить товар', callback_data: 'admin_predefined_add_new' }],
        [{ text: '🗑️ Удалить товар', callback_data: 'admin_predefined_delete' }],
        [{ text: '◀️ Назад', callback_data: 'admin_predefined_products' }]
    ];

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
 * Показ меню удаления предустановленных товаров
 */
export async function showPredefinedProductsDeleteMenu(ctx) {
    const products = getMockProducts();
    const currencySymbol = await settingsService.getCurrencySymbol();

    if (products.length === 0) {
        const text = `
🗑️ <b>Удаление предустановленных товаров</b>

Товаров для удаления нет.
        `.trim();

        const keyboard = [
            [{ text: '◀️ Назад', callback_data: 'admin_predefined_products' }]
        ];

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
        return;
    }

    const text = `
🗑️ <b>Удаление предустановленного товара</b>

Выберите товар для удаления:
    `.trim();

    const keyboard = products.map((product, index) => [
        {
            text: `🗑️ ${product.name} - ${product.price.toLocaleString('ru-RU')} ${currencySymbol}`,
            callback_data: `admin_predefined_delete_confirm_${index}`
        }
    ]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_predefined_products' }]);

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
 * Показ меню управления предустановленными товарами (из настроек)
 */
export async function showPredefinedProductsManagement(ctx) {
    const products = getMockProducts();
    const currencySymbol = await settingsService.getCurrencySymbol();

    const text = `
📦 <b>Управление предустановленными товарами</b>

Всего товаров: ${products.length}

Выберите действие:
    `.trim();

    const keyboard = [
        [{ text: '📋 Список товаров', callback_data: 'admin_predefined_list' }],
        [{ text: '➕ Добавить товар', callback_data: 'admin_predefined_add_new' }],
        [{ text: '🗑️ Удалить товар', callback_data: 'admin_predefined_delete' }],
        [{ text: '◀️ Назад', callback_data: 'admin_settings' }]
    ];

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
