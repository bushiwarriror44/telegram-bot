import { cityService } from '../../services/cityService.js';
import { districtService } from '../../services/districtService.js';
import { productService } from '../../services/productService.js';
import { packagingService } from '../../services/packagingService.js';
import { settingsService } from '../../services/settingsService.js';
import { isAdmin } from './authHandler.js';
import { formatPackaging } from '../../utils/packagingHelper.js';

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

// Режим редактирования фасовки товара
export const productPackagingEditMode = new Map(); // userId -> productId

// Режимы добавления/размещения предустановленных товаров
export const predefinedProductSelectMode = new Map(); // userId -> true (выбор предустановленного товара)
export const predefinedProductCityMode = new Map(); // userId -> { name, description, image_path } (выбор города)
export const predefinedProductDistrictMode = new Map(); // userId -> { name, description, image_path, cityId, cityName } (выбор района)
export const predefinedProductAddMode = new Map(); // userId -> 'name' | 'description' | 'price' | 'packaging' (добавление нового предустановленного товара)
export const predefinedProductAddSource = new Map(); // userId -> 'settings' | 'products' (источник вызова добавления товара)
export const predefinedProductImageUploadMode = new Map(); // userId -> predefinedIndex (загрузка фото для предустановленного товара)

// Новый flow: добавление товара из шаблона через "Фасовки"
export const predefinedPlacementMode = new Map(); // userId -> 'city_input'|'district_input'|'packaging_input'|'price_input'
export const predefinedPlacementState = new Map(); // userId -> { templateIndex, name, description, image_path, cityId, cityName, districtIds:Set<number>, packagingId, packagingValue, price }

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
        await showDistrictsForProducts(ctx, cityId, 0);
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
                null, // imagePath будет null при создании через команду
                null // packaging_label (декоративный текст фасовки) по умолчанию отсутствует
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
            const product = await productService.getById(productId);
            await productService.delete(productId);
            console.log(`[ProductsAdmin] Удалён товар id=${productId}, название="${product?.name || '?'}", район id=${districtId}`);
            await ctx.editMessageText('✅ Товар успешно удален!');
            await showDistrictProductsAdmin(ctx, districtId);
        } catch (error) {
            console.error('[ProductsAdmin] Ошибка удаления товара:', productId, error);
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
• Фасовка: ${formatPackaging(product.packaging_value)}
• Фото: ${imageStatus}${imageInstructions}

Выберите действие:
        `.trim();

        const keyboard = [
            [{ text: hasImage ? '📷 Изменить фото' : '📷 Загрузка фото (ИНФО)', callback_data: `admin_product_upload_photo_${product.id}` }],
            [{ text: '🏷️ Изменить фасовку', callback_data: `admin_product_edit_packaging_${product.id}` }],
            [{ text: '◀️ Назад к товарам', callback_data: `admin_products_district_${product.district_id}` }]
        ];

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_product_edit_packaging_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const productId = parseInt(ctx.match[1]);
        const product = await productService.getById(productId);

        if (!product) {
            await ctx.reply('Товар не найден.');
            return;
        }

        productPackagingEditMode.set(ctx.from.id, productId);

        // Получаем список всех фасовок
        const packagings = await packagingService.getAll();
        const packagingList = packagings.length > 0
            ? packagings.map(p => `• ${formatPackaging(p.value)}`).join('\n')
            : 'Фасовки не добавлены. Сначала добавьте фасовки в админ-панели.';

        await ctx.reply(
            '🏷️ <b>Редактирование фасовки товара</b>\n\n' +
            `Текущая фасовка: <b>${formatPackaging(product.packaging_value)}</b>\n\n` +
            `Доступные фасовки:\n${packagingList}\n\n` +
            `Введите новую фасовку (только число, например: 0.5, 1, 1000):\n\n` +
            `Для отмены отправьте /cancel`,
            { parse_mode: 'HTML' }
        );
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
        await showPredefinedProductsForPlacement(ctx);
    });

    // Новый flow: выбор шаблона для размещения (используется в разделе "Фасовки" и кнопке "Добавить из шаблона")
    bot.action(/^admin_predef_place_template_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const templateIndex = parseInt(ctx.match[1]);
        const templates = getMockProducts();
        const tpl = templates[templateIndex];
        if (!tpl) {
            await ctx.answerCbQuery('❌ Товар не найден');
            return;
        }
        predefinedPlacementState.set(ctx.from.id, {
            templateIndex,
            name: tpl.name,
            description: tpl.description || '',
            image_path: tpl.image_path || null,
            cityId: null,
            cityName: null,
            districtIds: new Set(),
            packagingId: null,
            packagingValue: null,
            price: null
        });
        await ctx.answerCbQuery();
        await showCitiesForPlacement(ctx);
    });

    // Выбор города (кнопкой)
    bot.action(/^admin_predef_place_city_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        const city = await cityService.getById(cityId);
        if (!city) {
            await ctx.answerCbQuery('❌ Город не найден');
            return;
        }
        const st = predefinedPlacementState.get(ctx.from.id);
        if (!st) return;
        st.cityId = city.id;
        st.cityName = city.name;
        st.districtIds = new Set();
        predefinedPlacementState.set(ctx.from.id, st);
        await ctx.answerCbQuery();
        await showDistrictsForPlacement(ctx);
    });

    // Ввод города вручную
    bot.action('admin_predef_place_city_manual', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        predefinedPlacementMode.set(ctx.from.id, 'city_input');
        await ctx.answerCbQuery();
        await ctx.reply('✏️ Введите название города (если нет — будет создан автоматически):');
    });

    // Multi-select районов
    bot.action(/^admin_predef_place_toggle_district_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        const st = predefinedPlacementState.get(ctx.from.id);
        if (!st) return;
        if (!st.districtIds) st.districtIds = new Set();
        if (st.districtIds.has(districtId)) st.districtIds.delete(districtId);
        else st.districtIds.add(districtId);
        predefinedPlacementState.set(ctx.from.id, st);
        await ctx.answerCbQuery();
        const currentPage = st.districtPage || 0;
        await showDistrictsForPlacement(ctx, true, currentPage);
    });

    // Переключение страниц районов
    bot.action(/^admin_predef_place_districts_page_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const page = parseInt(ctx.match[1]);
        await ctx.answerCbQuery();
        await showDistrictsForPlacement(ctx, true, page);
    });

    // Пагинация списка районов для управления товарами
    bot.action(/^admin_products_districts_page_(\d+)_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        const page = parseInt(ctx.match[2]);
        await ctx.answerCbQuery();
        await showDistrictsForProducts(ctx, cityId, page);
    });

    // Пагинация списка районов для размещения предустановленного товара
    bot.action(/^admin_predefined_districts_page_(\d+)_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        const page = parseInt(ctx.match[2]);
        await ctx.answerCbQuery();
        await showDistrictsForPredefinedProduct(ctx, cityId, page);
    });

    // Пагинация списка товаров в районе
    bot.action(/^admin_products_list_page_(\d+)_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        const page = parseInt(ctx.match[2]);
        await ctx.answerCbQuery();
        await showDistrictProductsAdmin(ctx, districtId, page);
    });

    bot.action('admin_predef_place_district_manual', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        predefinedPlacementMode.set(ctx.from.id, 'district_input');
        await ctx.answerCbQuery();
        await ctx.reply('✏️ Введите название района (если нет — будет создан в выбранном городе):');
    });

    bot.action('admin_predef_place_district_done', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.answerCbQuery();
        await showPackagingForPlacement(ctx);
    });

    // Выбор существующей фасовки
    bot.action(/^admin_predef_place_packaging_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const packagingId = parseInt(ctx.match[1]);
        const packaging = await packagingService.getById(packagingId);
        if (!packaging) {
            await ctx.answerCbQuery('❌ Фасовка не найдена');
            return;
        }
        const st = predefinedPlacementState.get(ctx.from.id);
        if (!st) return;
        st.packagingId = packaging.id;
        st.packagingValue = packaging.value;
        predefinedPlacementState.set(ctx.from.id, st);
        await ctx.answerCbQuery();
        await promptPriceForPlacement(ctx);
    });

    bot.action('admin_predef_place_packaging_manual', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        predefinedPlacementMode.set(ctx.from.id, 'packaging_input');
        await ctx.answerCbQuery();
        await ctx.reply('✏️ Введите фасовку (в граммах). Пример: 7.5 или 7,5гр');
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
            image_path: product.image_path || null
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

    // Обработчик для управления фото предустановленных товаров
    bot.action('admin_predefined_photo', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.answerCbQuery();
        await showPredefinedProductsPhotoMenu(ctx);
    });

    // Обработчик для удаления предустановленного товара
    bot.action('admin_predefined_delete', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.answerCbQuery();
        await showPredefinedProductsDeleteMenu(ctx);
    });

    // Обработчик для подтверждения удаления товара (шаблон + все размещённые в районах)
    bot.action(/^admin_predefined_delete_confirm_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const productIndex = parseInt(ctx.match[1]);
        const products = getMockProducts();
        if (productIndex < 0 || productIndex >= products.length) {
            await ctx.answerCbQuery('❌ Товар не найден');
            return;
        }
        const product = products[productIndex];
        const productName = product.name;
        try {
            // Удаляем из БД все товары с этим именем (во всех районах)
            const deletedFromDb = await productService.deleteByName(productName);
            console.log(`[PredefinedProducts] Удаление предустановленного товара "${productName}": из БД удалено записей: ${deletedFromDb}`);
            const { removeMockProduct } = await import('../../utils/mockData.js');
            const removed = removeMockProduct(productName);
            console.log(`[PredefinedProducts] Шаблон "${productName}" удалён из mockData: ${removed}`);
            if (removed || deletedFromDb > 0) {
                await ctx.answerCbQuery('✅ Товар удален!');
                await showPredefinedProductsManagement(ctx);
            } else {
                await ctx.answerCbQuery('❌ Ошибка при удалении');
            }
        } catch (err) {
            console.error('[PredefinedProducts] Ошибка при удалении предустановленного товара:', productName, err);
            await ctx.answerCbQuery('❌ Ошибка при удалении');
        }
    });

    // Обработчик выбора предустановленного товара для загрузки фото
    bot.action(/^admin_predefined_upload_photo_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const index = parseInt(ctx.match[1]);
        await ctx.answerCbQuery();
        await handlePredefinedUploadPhotoSelection(ctx, index);
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
 * Показ районов для выбора товаров (с пагинацией)
 */
export async function showDistrictsForProducts(ctx, cityId, page = 0) {
    const city = await cityService.getById(cityId);
    if (!city) {
        await ctx.reply('Город не найден.');
        return;
    }

    const districts = await districtService.getByCityId(cityId);

    const ITEMS_PER_PAGE = 20;
    const totalPages = Math.ceil(districts.length / ITEMS_PER_PAGE) || 1;
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIdx = currentPage * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, districts.length);
    const pageItems = districts.slice(startIdx, endIdx);

    const text = `
📦 <b>Управление товарами</b>

Город: <b>${city.name}</b>

Выберите район:${totalPages > 1 ? `\n📄 Страница ${currentPage + 1} из ${totalPages}` : ''}
    `.trim();

    const keyboard = pageItems.map(district => [
        { text: `📍 ${district.name}`, callback_data: `admin_products_district_${district.id}` }
    ]);

    if (totalPages > 1) {
        const navRow = [];
        if (currentPage > 0) {
            navRow.push({
                text: '◀️ Предыдущая',
                callback_data: `admin_products_districts_page_${cityId}_${currentPage - 1}`
            });
        }
        if (currentPage < totalPages - 1) {
            navRow.push({
                text: 'Следующая ▶️',
                callback_data: `admin_products_districts_page_${cityId}_${currentPage + 1}`
            });
        }
        if (navRow.length) keyboard.push(navRow);
    }

    keyboard.push([{ text: '➕ Добавить новый предустановленный товар', callback_data: 'admin_predefined_add_new' }]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_products' }]);

    const reply_markup = { inline_keyboard: keyboard };

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup
            });
        } catch (error) {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup
            });
        }
    } else {
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup
        });
    }
}

/**
 * Показ товаров в районе (с пагинацией)
 */
export async function showDistrictProductsAdmin(ctx, districtId, page = 0) {
    const district = await districtService.getById(districtId);
    if (!district) {
        await ctx.reply('Район не найден.');
        return;
    }

    const city = await cityService.getById(district.city_id);
    const products = await productService.getByDistrictId(districtId);

    const ITEMS_PER_PAGE = 20;
    const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE) || 1;
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIdx = currentPage * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, products.length);
    const pageItems = products.slice(startIdx, endIdx);

    const currencySymbol = await settingsService.getCurrencySymbol();
    const text = `
📦 <b>Товары в районе: ${district.name} (${city.name})</b>${totalPages > 1 ? `\n📄 Страница ${currentPage + 1} из ${totalPages}` : ''}

${pageItems.map(p => {
        const packagingLabel = p.packaging_value ? ` (${formatPackaging(p.packaging_value)})` : '';
        return `• ${p.name}${packagingLabel} - ${p.price} ${currencySymbol}`;
    }).join('\n') || 'Товаров пока нет'}
    `.trim();

    const keyboard = [];

    if (totalPages > 1) {
        const navRow = [];
        if (currentPage > 0) {
            navRow.push({
                text: '◀️ Предыдущая',
                callback_data: `admin_products_list_page_${districtId}_${currentPage - 1}`
            });
        }
        if (currentPage < totalPages - 1) {
            navRow.push({
                text: 'Следующая ▶️',
                callback_data: `admin_products_list_page_${districtId}_${currentPage + 1}`
            });
        }
        if (navRow.length) keyboard.push(navRow);
    }

    keyboard.push([{ text: '➕ Добавить товар', callback_data: `admin_product_add_${districtId}` }]);
    keyboard.push([{ text: '✏️ Редактировать товар', callback_data: `admin_product_edit_${districtId}` }]);
    keyboard.push([{ text: '🗑️ Удалить товар', callback_data: `admin_product_delete_${districtId}` }]);
    keyboard.push([{ text: '◀️ Назад к районам', callback_data: `admin_products_city_${city.id}` }]);

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
📦 <b> товары</b>

Выберите товар для добавления:
    `.trim();

    const keyboard = products.map((product, index) => [
        {
            text: `${product.name}`,
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

// Новый список шаблонов для размещения (без цены/фасовки)
export async function showPredefinedProductsForPlacement(ctx) {
    const templates = getMockProducts();
    const text = `
📦 <b>Добавление товара из шаблона</b>

Выберите предустановленный товар:
    `.trim();

    const keyboard = templates.map((t, idx) => [
        { text: t.name, callback_data: `admin_predef_place_template_${idx}` }
    ]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_packagings' }]);

    const reply_markup = { inline_keyboard: keyboard };
    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
        } catch {
            await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
        }
    } else {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
    }
}

async function showCitiesForPlacement(ctx) {
    const st = predefinedPlacementState.get(ctx.from.id);
    const cities = await cityService.getAll();
    const text = `
📦 <b>${st?.name || 'Товар'}</b>

Выберите город или введите его вручную:
    `.trim();

    const keyboard = cities.map((c) => [
        { text: `🏙️ ${c.name}`, callback_data: `admin_predef_place_city_${c.id}` }
    ]);
    keyboard.push([{ text: '✏️ Ввести город вручную', callback_data: 'admin_predef_place_city_manual' }]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_packagings' }]);

    const reply_markup = { inline_keyboard: keyboard };
    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
        } catch {
            await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
        }
    } else {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
    }
}

async function showDistrictsForPlacement(ctx, tryEdit = false, page = 0) {
    const st = predefinedPlacementState.get(ctx.from.id);
    if (!st?.cityId) {
        await ctx.reply('❌ Сначала выберите город.');
        return;
    }
    const districts = await districtService.getByCityId(st.cityId);
    const selected = st.districtIds || new Set();

    // Пагинация: по 20 районов на страницу
    const ITEMS_PER_PAGE = 20;
    const totalPages = Math.ceil(districts.length / ITEMS_PER_PAGE);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIdx = currentPage * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, districts.length);
    const districtsOnPage = districts.slice(startIdx, endIdx);

    // Сохраняем текущую страницу в состоянии
    st.districtPage = currentPage;
    predefinedPlacementState.set(ctx.from.id, st);

    const text = `
📍 <b>Город: ${st.cityName}</b>
📦 Товар: <b>${st.name}</b>

Выберите один или несколько районов:
${totalPages > 1 ? `\n📄 Страница ${currentPage + 1} из ${totalPages}` : ''}
    `.trim();

    const keyboard = districtsOnPage.map((d) => {
        const mark = selected.has(d.id) ? '✅' : '☐';
        return [{ text: `${mark} ${d.name}`, callback_data: `admin_predef_place_toggle_district_${d.id}` }];
    });

    // Навигация по страницам
    if (totalPages > 1) {
        const navRow = [];
        if (currentPage > 0) {
            navRow.push({ text: '◀️ Предыдущая', callback_data: `admin_predef_place_districts_page_${currentPage - 1}` });
        }
        if (currentPage < totalPages - 1) {
            navRow.push({ text: 'Следующая ▶️', callback_data: `admin_predef_place_districts_page_${currentPage + 1}` });
        }
        if (navRow.length > 0) {
            keyboard.push(navRow);
        }
    }

    keyboard.push([{ text: '✏️ Ввести район вручную', callback_data: 'admin_predef_place_district_manual' }]);
    keyboard.push([{ text: '✅ Готово', callback_data: 'admin_predef_place_district_done' }]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_predef_place_city_manual' }]);

    const reply_markup = { inline_keyboard: keyboard };
    if (ctx.callbackQuery && tryEdit) {
        try {
            await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
            return;
        } catch { }
    }
    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
        } catch {
            await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
        }
    } else {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
    }
}

async function showPackagingForPlacement(ctx) {
    const st = predefinedPlacementState.get(ctx.from.id);
    const selectedCount = st?.districtIds?.size || 0;
    if (!selectedCount) {
        await ctx.reply('❌ Выберите хотя бы один район и нажмите "Готово".');
        return;
    }
    const packagings = await packagingService.getAll();
    const text = `
🏷️ <b>Фасовка</b>

Товар: <b>${st.name}</b>
Город: <b>${st.cityName}</b>
Районов выбрано: <b>${selectedCount}</b>

Выберите фасовку из существующих или введите свою:
    `.trim();

    const keyboard = packagings.slice(0, 40).map((p) => [
        { text: formatPackaging(p.value), callback_data: `admin_predef_place_packaging_${p.id}` }
    ]);
    keyboard.push([{ text: '✏️ Ввести фасовку вручную', callback_data: 'admin_predef_place_packaging_manual' }]);
    keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_predef_place_district_done' }]);

    const reply_markup = { inline_keyboard: keyboard };
    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup });
        } catch {
            await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
        }
    } else {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
    }
}

async function promptPriceForPlacement(ctx) {
    predefinedPlacementMode.set(ctx.from.id, 'price_input');
    await ctx.reply('💰 Введите цену (только число), например: 1000');
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

    const currencySymbol = await settingsService.getCurrencySymbol();
    const priceStr = productData.price != null && productData.price !== ''
        ? `${Number(productData.price).toLocaleString('ru-RU')} ${currencySymbol}`
        : 'не указана';

    const text = `
📦 <b>Выбран товар: ${productData.name}</b>
💰 Цена: ${priceStr}

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
export async function showDistrictsForPredefinedProduct(ctx, cityId, page = 0) {
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

    const ITEMS_PER_PAGE = 20;
    const totalPages = Math.ceil(districts.length / ITEMS_PER_PAGE) || 1;
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIdx = currentPage * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, districts.length);
    const pageItems = districts.slice(startIdx, endIdx);

    const text = `
📦 <b>Выбран товар: ${productData.name}</b>
🏙️ <b>Город: ${city.name}</b>

Выберите район для размещения товара:${totalPages > 1 ? `\n📄 Страница ${currentPage + 1} из ${totalPages}` : ''}
(Если района нет в списке, введите его название)
    `.trim();

    const keyboard = pageItems.map(district => [
        { text: `📍 ${district.name}`, callback_data: `admin_predefined_district_${district.id}` }
    ]);

    if (totalPages > 1) {
        const navRow = [];
        if (currentPage > 0) {
            navRow.push({
                text: '◀️ Предыдущая',
                callback_data: `admin_predefined_districts_page_${cityId}_${currentPage - 1}`
            });
        }
        if (currentPage < totalPages - 1) {
            navRow.push({
                text: 'Следующая ▶️',
                callback_data: `admin_predefined_districts_page_${cityId}_${currentPage + 1}`
            });
        }
        if (navRow.length) keyboard.push(navRow);
    }

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

        // Проверяем, что у предустановленного товара задана цена
        const rawPrice = productData.price;
        const price = rawPrice != null ? Number(rawPrice) : NaN;
        if (!Number.isFinite(price) || price <= 0) {
            const msg =
                '❌ Цена для этого предустановленного товара не задана.\n\n' +
                'Размещение через этот раздел предполагает, что цена уже указана.\n' +
                'Рекомендуется использовать раздел «Фасовки» → «Добавить товар из шаблона», где цена задаётся при размещении.';
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('❌ Цена не задана');
                await ctx.reply(msg);
            } else {
                await ctx.reply(msg);
            }
            console.error('[ProductsHandler] Попытка разместить предустановленный товар без цены:', {
                userId: ctx.from?.id,
                productName: productData.name,
                districtId,
            });
            return;
        }

        // Получаем фасовку из данных товара или используем дефолтную (1 кг)
        let packaging = null;
        if (productData.packagingId) {
            packaging = await packagingService.getById(productData.packagingId);
        }

        if (!packaging) {
            // Если фасовки нет в данных, используем дефолтную (1 кг)
            packaging = await packagingService.getByValue(1);
            if (!packaging) {
                // Если фасовки нет, создаем её
                packaging = await packagingService.create(1);
            }
        }

        await productService.create(
            district.city_id,
            districtId,
            productData.name,
            productData.description,
            price,
            packaging.id,
            productData.image_path || null, // наследуем изображение из предустановленного товара, если есть
            null // packaging_label для этого старого flow пока не задаётся
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
        `${index + 1}. <b>${product.name}</b>\n   Описание: ${product.description || '—'}`
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
            text: `🗑️ ${product.name}`,
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

// Обработчик выбора предустановленного товара для загрузки фото
export async function handlePredefinedUploadPhotoSelection(ctx, index) {
    const products = getMockProducts();
    if (index < 0 || index >= products.length) {
        await ctx.answerCbQuery('❌ Товар не найден');
        return;
    }

    const product = products[index];
    predefinedProductImageUploadMode.set(ctx.from.id, index);

    const text = `
📷 <b>Загрузка/изменение фото предустановленного товара</b>

Товар: <b>${product.name}</b>

1️⃣ Отправьте изображение этого товара в чат как <b>фото</b> (не как документ).
2️⃣ После загрузки фото оно будет автоматически привязано ко всем товарам, созданным из этого шаблона.

Для отмены отправьте /cancel
    `.trim();

    await ctx.reply(text, { parse_mode: 'HTML' });
}

/**
 * Показ меню выбора предустановленного товара для загрузки/изменения фото
 */
export async function showPredefinedProductsPhotoMenu(ctx) {
    const products = getMockProducts();
    const currencySymbol = await settingsService.getCurrencySymbol();

    if (products.length === 0) {
        const text = `
📷 <b>Фото предустановленных товаров</b>

Товаров пока нет.
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
📷 <b>Фото предустановленных товаров</b>

Выберите товар, для которого хотите загрузить или изменить фото:
    `.trim();

    const keyboard = products.map((product, index) => [
        {
            text: `${product.name}`,
            callback_data: `admin_predefined_upload_photo_${index}`
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
        [{ text: '📷 Фото товаров', callback_data: 'admin_predefined_photo' }],
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
