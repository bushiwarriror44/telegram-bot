import { cityService } from '../../services/cityService.js';
import { districtService } from '../../services/districtService.js';
import { productService } from '../../services/productService.js';
import { userService } from '../../services/userService.js';
import { settingsService } from '../../services/settingsService.js';
import { statisticsService } from '../../services/statisticsService.js';
import { promocodeService } from '../../services/promocodeService.js';
import { orderService } from '../../services/orderService.js';
import { paymentService } from '../../services/paymentService.js';
import { referralService } from '../../services/referralService.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getCurrencySymbol } from '../../utils/currencyHelper.js';
import { generateTXID, generatePaymentRequestText } from '../../utils/textFormatters.js';
import { cardAccountService } from '../../services/cardAccountService.js';
import { cryptoExchangeService } from '../../services/cryptoExchangeService.js';
import { formatPackaging } from '../../utils/packagingHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Хранит пользователей, которые вводят промокод (userId -> productId)
export const promocodeInputMode = new Map();

// Хранит время блокировки после отмены заказа (userId -> timestamp)
// Блокировка длится 30 минут
export const orderCancelBlock = new Map();

/**
 * Получает notificationService из объекта bot
 * @param {Object} bot - Экземпляр Telegraf бота
 * @returns {Object|null} - Экземпляр NotificationService или null
 */
function getNotificationService(bot) {
    return bot?.notificationService || null;
}

/**
 * Регистрирует обработчики каталога
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerCatalogHandlers(bot) {
    // Обработка выбора витрины
    bot.action('select_storefront', async (ctx) => {
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });
        await showCitiesMenu(ctx);
    });

    // Обработка выбора города: сразу показываем витрину товаров по городу
    bot.action(/^city_(\d+)$/, async (ctx) => {
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });
        const cityId = parseInt(ctx.match[1]);
        await showCityProductsMenu(ctx, cityId);
    });

    // Обработка выбора района
    bot.action(/^district_(\d+)$/, async (ctx) => {
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });
        const districtId = parseInt(ctx.match[1]);
        await showProductsMenu(ctx, districtId);
    });

    // Обработка выбора товара
    bot.action(/^product_(\d+)$/, async (ctx) => {
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });
        const productId = parseInt(ctx.match[1]);
        // Записываем просмотр товара
        const { statisticsService } = await import('../../services/statisticsService.js');
        await statisticsService.recordProductView(productId, ctx.from.id);
        await showProductDetails(ctx, productId);
    });

    // Обработка выбора товара по городу (сначала город -> товар, потом выбор района)
    bot.action(/^cityproduct_(\d+)_(\d+)$/, async (ctx) => {
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });

        const cityId = parseInt(ctx.match[1]);
        const baseProductId = parseInt(ctx.match[2]);

        const city = await cityService.getById(cityId);
        if (!city) {
            await ctx.reply('Город не найден.');
            return;
        }

        const baseProduct = await productService.getById(baseProductId);
        if (!baseProduct) {
            await ctx.reply('Товар не найден.');
            return;
        }

        // Ищем все варианты этого товара (по имени и фасовке) во всех районах выбранного города
        const cityProducts = await productService.getByCityId(cityId);
        const sameProducts = cityProducts.filter(p =>
            p.name === baseProduct.name &&
            (p.packaging_value || null) === (baseProduct.packaging_value || null)
        );

        if (sameProducts.length === 0) {
            await ctx.reply('Товар в этом городе больше не доступен.');
            return;
        }

        // Получаем районы для всех вариантов товара (только существующие)
        const districtsInCity = await districtService.getByCityId(cityId);
        const districtById = new Map(districtsInCity.map(d => [d.id, d]));

        const keyboard = sameProducts
            .map(product => {
                const district = districtById.get(product.district_id);
                if (!district) return null;
                return [
                    {
                        text: district.name,
                        // После выбора района просто переходим к детали конкретного товара
                        callback_data: `product_${product.id}`
                    }
                ];
            })
            .filter(Boolean);

        // Товар есть в БД, но все его районы удалены — возвращаем к списку товаров без ошибки
        if (keyboard.length === 0) {
            await ctx.answerCbQuery();
            await showCityProductsMenu(ctx, cityId);
            return;
        }

        keyboard.push([
            { text: '◀️ Назад к товарам', callback_data: `back_to_city_products_${cityId}` }
        ]);

        let packagingLabel = '';
        if (baseProduct.packaging_value) {
            const decor = baseProduct.packaging_label || '';
            const decorPart = decor ? ` ${decor}` : '';
            packagingLabel = ` (${formatPackaging(baseProduct.packaging_value, baseProduct.packaging_unit)}${decorPart})`;
        }

        await ctx.reply(
            `🏙️ Город: ${city.name}\n📦 Товар: ${baseProduct.name}${packagingLabel}\n\n📍 Выберите район:`,
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    });

    // Обработка ввода промокода
    bot.action(/^enter_promo_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        promocodeInputMode.set(ctx.from.id, productId);
        await ctx.reply(
            '✏️ Введите промо-код:\n\nОтправьте промо-код текстом.',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Отмена', callback_data: `back_to_product_${productId}` }]
                    ]
                }
            }
        );
    });

    // Обработка продолжения без промокода
    bot.action(/^continue_no_promo_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        await createOrder(ctx, productId, null);
    });

    // Обработка выбора метода оплаты для заказа
    bot.action(/^pay_order_(\d+)_(.+)$/, async (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        const methodId = decodeURIComponent(ctx.match[2]);
        await showPaymentAddressForOrder(ctx, orderId, methodId);
    });

    // Обработка просмотра заказа
    bot.action(/^view_order_(\d+)$/, async (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        const order = await orderService.getById(orderId);

        if (!order) {
            await ctx.answerCbQuery('Заказ не найден');
            return;
        }

        // Проверяем, является ли заказ отмененным или неоплаченным
        const isCancelledOrUnpaid = order.status === 'cancelled' ||
            order.status === 'pending' ||
            (order.status !== 'completed' && order.status !== 'paid');

        await ctx.answerCbQuery();

        if (isCancelledOrUnpaid) {
            await ctx.reply(`Заказ №${order.id} был отменен`);
        } else {
            // Для оплаченных заказов показываем детали
            await showOrderDetails(ctx, orderId);
        }
    });

    // Обработка кнопки "Поддержка" для заказа
    bot.action(/^order_support_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const { showHelpMenu } = await import('./supportHandler.js');
        await showHelpMenu(ctx);
    });

    // Обработка кнопки "Перейти к активному заказу"
    bot.action(/^view_active_order_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const orderId = parseInt(ctx.match[1]);
        const order = await orderService.getById(orderId);

        if (!order) {
            await ctx.reply('❌ Заказ не найден.');
            return;
        }

        // Проверяем, что заказ принадлежит пользователю
        if (order.user_chat_id !== ctx.from.id) {
            await ctx.reply('❌ Это не ваш заказ.');
            return;
        }

        // Проверяем статус заказа
        if (order.status === 'cancelled' || order.status === 'expired') {
            await ctx.reply('❌ Этот заказ был отменен или истек.');
            return;
        }

        // Показываем стандартный блок с возможностью оплаты заказа
        await showOrderDetails(ctx, orderId);
    });

    // Обработка кнопки "Отменить активный заказ"
    bot.action(/^cancel_active_order_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const orderId = parseInt(ctx.match[1]);
        const order = await orderService.getById(orderId);

        if (!order) {
            await ctx.reply('❌ Заказ не найден.');
            return;
        }

        // Проверяем, что заказ принадлежит пользователю
        if (order.user_chat_id !== ctx.from.id) {
            await ctx.reply('❌ Это не ваш заказ.');
            return;
        }

        // Проверяем, что заказ можно отменить (pending или paid)
        if (order.status !== 'pending' && order.status !== 'paid') {
            await ctx.reply('❌ Заказ уже обработан.');
            return;
        }

        // Отменяем заказ
        await orderService.cancelOrder(orderId);

        // Устанавливаем блокировку на 30 минут
        orderCancelBlock.set(ctx.from.id, Date.now());

        await ctx.reply('✅ Заказ успешно отменен, удачных покупок');
    });

    // Обработка кнопки "Скопировать реквизиты"
    bot.action(/^copy_payment_details_(\d+)$/, async (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        const order = await orderService.getById(orderId);

        if (!order) {
            await ctx.answerCbQuery('Заказ не найден');
            return;
        }

        // Проверяем, что заказ принадлежит пользователю
        if (order.user_chat_id !== ctx.from.id) {
            await ctx.answerCbQuery('Это не ваш заказ');
            return;
        }

        // Берём текст именно того сообщения, по которому нажата кнопка
        const originalText = ctx.callbackQuery?.message?.text;

        if (!originalText) {
            await ctx.answerCbQuery('Текст реквизитов не найден');
            return;
        }

        await ctx.answerCbQuery('Реквизиты скопированы');

        // Дублируем реквизиты отдельным сообщением в виде кода, чтобы было удобно скопировать
        await ctx.reply(`📋 Реквизиты для оплаты (скопируйте из блока ниже):\n\n<code>${originalText}</code>`, {
            parse_mode: 'HTML'
        });
    });

    // Обработка кнопки "Отменить заявку"
    bot.action(/^cancel_order_(\d+)$/, async (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        const order = await orderService.getById(orderId);

        if (!order) {
            await ctx.answerCbQuery('Заказ не найден');
            return;
        }

        // Проверяем, что заказ принадлежит пользователю
        if (order.user_chat_id !== ctx.from.id) {
            await ctx.answerCbQuery('Это не ваш заказ');
            return;
        }

        // Проверяем, что заказ можно отменить (pending или paid)
        if (order.status !== 'pending' && order.status !== 'paid') {
            await ctx.answerCbQuery('Заказ уже обработан');
            return;
        }

        await ctx.answerCbQuery();

        // Отменяем заказ
        await orderService.cancelOrder(orderId);

        // Устанавливаем блокировку на 30 минут
        orderCancelBlock.set(ctx.from.id, Date.now());

        await ctx.reply('❌ Заявка отменена. В течение 30 минут вы не можете создавать новые заявки после отмены текущей.');
    });
}

/**
 * Показ меню выбора витрины
 */
export async function showStorefrontMenu(ctx) {
    try {
        const storefrontName = await settingsService.getStorefrontName();

        const keyboard = [
            [{ text: storefrontName, callback_data: 'select_storefront' }]
        ];

        await ctx.reply(
            '🛍 Каталог товаров:',
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    } catch (error) {
        console.error('[CatalogHandler] Ошибка при показе меню витрины:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
}

/**
 * Показ меню городов
 */
export async function showCitiesMenu(ctx) {
    const cities = await cityService.getAll();

    if (cities.length === 0) {
        await ctx.reply('Города пока не добавлены. Обратитесь к администратору.');
        return;
    }

    // Получаем иконку для городов из настроек
    const cityIcon = await settingsService.getCityIcon();
    const displayIcon = (cityIcon === '' || cityIcon === 'NONE') ? '' : `${cityIcon} `;

    const keyboard = cities.map(city => [
        { text: `${displayIcon}${city.name}`, callback_data: `city_${city.id}` }
    ]);

    // keyboard.push([{ text: 'Вернуться назад', callback_data: 'back_to_storefront' }]);

    await ctx.reply(
        '🛍 Каталог товаров:',
        {
            reply_markup: {
                inline_keyboard: keyboard
            }
        }
    );
}

/**
 * Показ меню товаров по городу (город -> список товаров, потом выбор района)
 */
export async function showCityProductsMenu(ctx, cityId) {
    const city = await cityService.getById(cityId);
    if (!city) {
        await ctx.reply('Город не найден.');
        return;
    }

    const allProducts = await productService.getByCityId(cityId);
    const districts = await districtService.getByCityId(cityId);
    const districtIds = new Set(districts.map(d => d.id));
    // Показываем только товары, у которых есть хотя бы один существующий район (не удалённый)
    const products = allProducts.filter(p => districtIds.has(p.district_id));

    if (products.length === 0) {
        await ctx.reply(
            `В городе ${city.name} пока нет товаров.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад к городам', callback_data: 'back_to_cities' }]
                    ]
                }
            }
        );
        return;
    }

    const currencySymbol = await getCurrencySymbol();

    // Группируем товары по имени + фасовке, чтобы показывать единый товар на город
    const groups = new Map();
    for (const p of products) {
        const key = `${p.name}::${p.packaging_value || ''}::${p.packaging_unit || ''}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(p);
    }

    const keyboard = [];
    for (const [, group] of groups.entries()) {
        // Берем первый вариант как базовый для кнопки
        const sample = group[0];

        let packagingLabel = '';
        if (sample.packaging_value) {
            const decor = sample.packaging_label || '';
            const decorPart = decor ? ` ${decor}` : '';
            packagingLabel = ` ${formatPackaging(sample.packaging_value, sample.packaging_unit)}${decorPart}`;
        }

        // В кнопках показываем оригинальную цену товара (без наценки)
        const minBasePrice = Math.min(...group.map(g => g.price));
        const displayPrice = Math.round(minBasePrice);

        keyboard.push([{
            text: `${sample.name}${packagingLabel} - ${displayPrice.toLocaleString('ru-RU')} ${currencySymbol}`,
            callback_data: `cityproduct_${cityId}_${sample.id}`
        }]);
    }

    keyboard.push([{ text: '◀️ Назад к городам', callback_data: 'back_to_cities' }]);

    await ctx.reply(
        `🏙️ Город: ${city.name}\n\n🛍 Выберите товар:`,
        {
            reply_markup: {
                inline_keyboard: keyboard
            }
        }
    );
}

/**
 * Показ меню районов
 */
export async function showDistrictsMenu(ctx, cityId) {
    const city = await cityService.getById(cityId);
    if (!city) {
        await ctx.reply('Город не найден.');
        return;
    }

    const districts = await districtService.getByCityId(cityId);

    if (districts.length === 0) {
        await ctx.reply(
            `В городе ${city.name} пока нет районов. Обратитесь к администратору.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад к городам', callback_data: 'back_to_cities' }],
                        [{ text: '🏠 На главную', callback_data: 'back_to_storefront' }]
                    ]
                }
            }
        );
        return;
    }

    const keyboard = districts.map(district => [
        { text: `${district.name}`, callback_data: `district_${district.id}` }
    ]);

    keyboard.push([{ text: 'Вернуться назад', callback_data: 'back_to_cities' }]);

    try {
        await ctx.editMessageText(
            `🛍 Категории товаров: "${city.name}"`,
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    } catch (error) {
        await ctx.reply(
            `🏙️ Город: ${city.name}\n\n📍 Выберите район:`,
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    }
}

/**
 * Показ меню товаров
 */
export async function showProductsMenu(ctx, districtId) {
    const district = await districtService.getById(districtId);
    if (!district) {
        await ctx.reply('Район не найден.');
        return;
    }

    const city = await cityService.getById(district.city_id);
    const products = await productService.getByDistrictId(districtId);
    const markupPercent = await settingsService.getGlobalMarkupPercent();
    const markupFactor = 1 + (markupPercent > 0 ? markupPercent : 0) / 100;

    if (products.length === 0) {
        await ctx.reply(
            `В районе ${district.name} (${city.name}) пока нет товаров.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад к районам', callback_data: `back_to_districts_${city.id}` }]
                    ]
                }
            }
        );
        return;
    }

    const currencySymbol = await getCurrencySymbol();
    const keyboard = [];
    for (const product of products) {
        let packagingLabel = '';
        if (product.packaging_value) {
            const decor = product.packaging_label || '';
            const decorPart = decor ? ` ${decor}` : '';
            packagingLabel = ` ${formatPackaging(product.packaging_value, product.packaging_unit)}${decorPart}`;
        }
        const displayPrice = Math.round(product.price * markupFactor);
        keyboard.push([
            {
                text: `${product.name}${packagingLabel} - ${displayPrice.toLocaleString('ru-RU')} ${currencySymbol}`,
                callback_data: `product_${product.id}`
            }
        ]);
    }

    keyboard.push([{ text: 'Вернуться назад', callback_data: `back_to_districts_${city.id}` }]);

    try {
        await ctx.editMessageText(
            `🛍️ Раздел "${district.name}" `,
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    } catch (error) {
        await ctx.reply(
            `🛍️ Раздел "${district.name}"`,
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    }
}

/**
 * Показ деталей товара
 */
export async function showProductDetails(ctx, productId) {
    const product = await productService.getById(productId);
    if (!product) {
        await ctx.reply('Товар не найден.');
        return;
    }

    const district = await districtService.getById(product.district_id);
    const city = await cityService.getById(product.city_id);

    let packagingLabel = '';
    if (product.packaging_value) {
        const decor = product.packaging_label || '';
        const decorPart = decor ? ` ${decor}` : '';
        packagingLabel = ` ${formatPackaging(product.packaging_value, product.packaging_unit)}${decorPart}`;
    }

    // Формируем текст: в карточке товара показываем оригинальную цену (без наценки)
    const currencySymbol = await getCurrencySymbol();
    const displayPrice = Math.round(product.price);

    const text = `Вы выбрали: ${product.name}${packagingLabel}


<b>Цена:</b> ${displayPrice.toLocaleString('ru-RU')} ${currencySymbol}
<b>Описание:</b> ${product.description || 'Описание отсутствует'}

❔ У вас есть промо-код ❔`;

    const keyboard = [
        [{ text: '✏️ Ввести промо', callback_data: `enter_promo_${product.id}` }],
        [{ text: '🙅‍♂️ Продолжить без промо', callback_data: `continue_no_promo_${product.id}` }],
        [{ text: '🔙 Назад', callback_data: `back_to_products_${district.id}` }]
    ];

    // Определяем источник изображения:
    // 1) локальный файл (если существует)
    // 2) иначе используем сохраненный путь/URL/file_id как есть
    let photoPath = null;
    if (product.image_path) {
        if (product.image_path.startsWith('./') || product.image_path.startsWith('../')) {
            photoPath = join(__dirname, '../../..', product.image_path);
        } else if (product.image_path.startsWith('src/')) {
            photoPath = join(__dirname, '../../..', product.image_path);
        } else {
            photoPath = product.image_path; // может быть абсолютный путь, URL или file_id
        }
    }

    // Логируем наличие и путь к изображению
    console.log('[CatalogHandler] showProductDetails image_path:', product.image_path || 'нет');
    console.log('[CatalogHandler] showProductDetails resolved photoPath:', photoPath || 'нет');

    const replyMarkup = {
        inline_keyboard: keyboard
    };

    const looksLikeLocalPath = (p) =>
        typeof p === 'string' && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p));

    const sendPhoto = async (source) => {
        // ВАЖНО: не удаляем сообщение заранее — иначе при ошибке фото нечего будет "edit"-ить.
        const sent = await ctx.replyWithPhoto(source, {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });

        // Если пришли из callback — аккуратно удаляем старое сообщение уже ПОСЛЕ успешной отправки фото
        if (ctx.callbackQuery) {
            await ctx.deleteMessage().catch(() => { });
        }

        return sent;
    };

    const sendText = async () => {
        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
            } catch (e) {
                // Если сообщение уже удалено/не найдено — просто отправляем новое
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
    };

    // Сначала пробуем отправить фото: если локальный файл существует — используем его,
    // иначе используем исходный путь (URL/file_id). При ошибке падаем обратно на текст.
    if (product.image_path) {
        try {
            const canUseFile = photoPath && existsSync(photoPath);

            if (canUseFile) {
                await sendPhoto({ source: photoPath });
            } else {
                // Если это похоже на локальный путь, но файла нет — не пытаемся слать строкой (Telegram сочтет это URL)
                if (looksLikeLocalPath(photoPath)) {
                    console.log('[CatalogHandler] Фото не найдено на диске, пропускаем отправку фото:', photoPath);
                    await sendText();
                } else {
                    // URL / file_id
                    await sendPhoto(photoPath);
                }
            }
        } catch (error) {
            console.error('[CatalogHandler] Ошибка при отправке фото, отправляем текст:', error);
            await sendText();
        }
    } else {
        await sendText();
    }
}

/**
 * Создание заказа
 */
export async function createOrder(ctx, productId, promocodeId = null) {
    try {
        console.log('[CatalogHandler] createOrder: Начало создания заказа');
        console.log('[CatalogHandler] createOrder: User ID:', ctx.from.id);
        console.log('[CatalogHandler] createOrder: Product ID:', productId);
        console.log('[CatalogHandler] createOrder: Promocode ID:', promocodeId);

        // Проверяем, есть ли активный заказ
        console.log('[CatalogHandler] createOrder: Проверка активного заказа для пользователя', ctx.from.id);
        const activeOrder = await orderService.getActiveOrder(ctx.from.id);
        console.log('[CatalogHandler] createOrder: Результат проверки активного заказа:', activeOrder ? 'Найден' : 'Не найден');
        if (activeOrder) {
            console.log('[CatalogHandler] createOrder: Детали активного заказа:', {
                id: activeOrder.id,
                status: activeOrder.status,
                user_chat_id: activeOrder.user_chat_id,
                created_at: activeOrder.created_at,
                product_id: activeOrder.product_id
            });
            await ctx.reply(
                '❌ У вас есть активный заказ, сначала завершите или отмените его, чтобы создать новый заказ',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 Перейти к активному заказу', callback_data: `view_active_order_${activeOrder.id}` }],
                            [{ text: '❌ Отменить активный заказ', callback_data: `cancel_active_order_${activeOrder.id}` }]
                        ]
                    }
                }
            );
            return;
        }
        console.log('[CatalogHandler] createOrder: Активный заказ не найден, продолжаем создание');

        // Проверяем, не заблокирован ли пользователь после отмены заказа
        const blockTime = orderCancelBlock.get(ctx.from.id);
        if (blockTime && Date.now() - blockTime < 30 * 60 * 1000) {
            const remainingMinutes = Math.ceil((30 * 60 * 1000 - (Date.now() - blockTime)) / (60 * 1000));
            await ctx.reply(`⏰ Вы не можете создавать новые заказы в течение ${remainingMinutes} минут после отмены текущего заказа.`);
            return;
        }

        // Если блокировка истекла, удаляем её
        if (blockTime) {
            orderCancelBlock.delete(ctx.from.id);
        }

        const product = await productService.getById(productId);
        if (!product) {
            await ctx.reply('Товар не найден.');
            return;
        }

        // Показываем сообщение о создании заказа
        await ctx.reply('♻️ 1 минуту, создаём заказ...');

        // Рассчитываем цену и скидку
        let price = product.price;
        let discount = 0;
        let promocode = null;

        // Применяем промокод, если есть
        if (promocodeId) {
            promocode = await promocodeService.getById(promocodeId);
            if (promocode) {
                discount = (price * promocode.discount_percent) / 100;
            }
        }

        // Применяем реферальную скидку
        const referral = await referralService.getReferrer(ctx.from.id);
        if (referral && referral.referrer_chat_id) {
            const referrals = await referralService.getReferralsByReferrer(referral.referrer_chat_id);
            const referralCount = referrals.length;
            const discountPercent = await settingsService.getReferralDiscountPercent();
            const maxDiscount = await settingsService.getMaxReferralDiscountPercent();
            const referralDiscount = Math.min(referralCount * discountPercent, maxDiscount);
            const referralDiscountAmount = (price * referralDiscount) / 100;
            discount += referralDiscountAmount;
        }

        const totalPrice = price - discount;

        // Создаем заказ
        const order = await orderService.create(
            ctx.from.id,
            productId,
            product.city_id,
            product.district_id,
            price,
            discount,
            totalPrice,
            promocodeId
        );

        // Отправляем уведомление о создании заказа
        const notificationService = getNotificationService(ctx.bot);
        if (notificationService) {
            await notificationService.notifyOrderCreated(order.id);
        }

        // Ждем 5 секунд перед показом заказа
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Показываем детали заказа
        await showOrderDetails(ctx, order.id);
    } catch (error) {
        console.error('[CatalogHandler] Ошибка при создании заказа:', error);
        await ctx.reply('❌ Произошла ошибка при создании заказа. Попробуйте позже.');
    }
}

/**
 * Показ деталей заказа
 */
export async function showOrderDetails(ctx, orderId) {
    try {
        const order = await orderService.getById(orderId);
        if (!order) {
            await ctx.reply('Заказ не найден.');
            return;
        }

        const packagingLabel = order.packaging_value ? ` ${formatPackaging(order.packaging_value, order.packaging_unit)}` : '';
        const promocodeText = order.promocode_code ? order.promocode_code : 'Нет';
        const currencySymbol = await getCurrencySymbol();
        const discountText = order.discount > 0 ? `${order.discount.toLocaleString('ru-RU')} ${currencySymbol}` : `0 ${currencySymbol}`;
        const markupPercent = await settingsService.getGlobalMarkupPercent();
        const markupFactor = 1 + (markupPercent > 0 ? markupPercent : 0) / 100;
        const finalWithMarkup = Math.round(order.total_price * markupFactor);

        const storefrontName = await settingsService.getStorefrontName();
        const text = `<b>Создан заказ #95${order.id}73</b>


<b>Город:</b> ${order.city_name} 
<b>Район:</b> ${order.district_name} 

<b>Товар:</b> ${order.product_name} ${packagingLabel} 
<b>Кол-во:</b> 1 
<b>Стоимость:</b> ${order.price.toLocaleString('ru-RU')} ${currencySymbol} 

<b>Промокод:</b> ${promocodeText} 
<b>Скидка:</b> ${discountText} 
<b>Финальная сумма:</b> Сумма с комиссией будет указана после получения реквизитов;
`;

        // Отправляем детали заказа без кнопок
        await ctx.reply(text, {
            parse_mode: 'HTML'
        });

        const paymentMethods = await paymentService.getAllMethods();
        if (paymentMethods.length === 0) {
            await ctx.reply(
                '❌ Методы оплаты пока не настроены. Обратитесь к администратору.',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'back_to_cities' }]
                        ]
                    }
                }
            );
            return;
        }

        const keyboard = paymentMethods.map(method => [
            { text: method.name, callback_data: `pay_order_${order.id}_${encodeURIComponent(method.id)}` }
        ]);

        // Отправляем отдельный блок с выбором способа оплаты
        await ctx.reply(
            '💰 Выберите способ пополнения:',
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    } catch (error) {
        console.error('[CatalogHandler] Ошибка при показе деталей заказа:', error);
        await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
}

/**
 * Показ адреса оплаты для заказа
 */
export async function showPaymentAddressForOrder(ctx, orderId, methodId) {
    const order = await orderService.getById(orderId);
    const method = await paymentService.getMethodById(methodId);

    if (!order || !method) {
        await ctx.reply('Ошибка: заказ или метод оплаты не найден.');
        return;
    }

    // Обновляем метод оплаты в заказе
    const paymentMethodId = typeof methodId === 'string' && methodId.startsWith('card_')
        ? null
        : (typeof methodId === 'string' ? parseInt(methodId) : methodId);

    if (paymentMethodId !== null) {
        await orderService.updatePaymentMethod(orderId, paymentMethodId);
    }

    // Отправляем уведомление о выборе способа оплаты
    const notificationService = getNotificationService(ctx.bot);
    if (notificationService) {
        await notificationService.notifyPaymentMethodSelected(orderId, method.name);
    }

    // Обновляем активность пользователя
    await userService.saveOrUpdate(ctx.from.id, {
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
    });

    // Показываем сообщение об ожидании получения реквизитов
    const waitingMsg = await ctx.reply('🕗 Ожидание получения реквизитов..');

    // Добавляем задержку перед показом блока с реквизитами (7 секунд)
    await new Promise(resolve => setTimeout(resolve, 7000));

    // Получаем глобальную наценку (комиссию) в процентах
    const markupPercent = await settingsService.getGlobalMarkupPercent();

    // Итоговая сумма с учетом наценки
    const baseAmount = order.total_price;
    const finalAmount = Math.round(baseAmount * (1 + (markupPercent > 0 ? markupPercent : 0) / 100));

    // Для карточных методов используем карточные счета, для криптовалют - адреса
    let paymentDetails = '';

    if (method.type === 'card') {
        let cardAccount;
        if (method.card_account_id) {
            cardAccount = await cardAccountService.getById(method.card_account_id);
        } else if (method.name) {
            // Для ТРАНСГРАН и других карточных методов получаем случайную карту
            if (method.name === 'ТРАНСГРАН') {
                cardAccount = await cardAccountService.getRandomCardByName('ТРАНСГРАН');
            } else {
                cardAccount = await cardAccountService.getRandomCardByName(method.name);
            }
        }

        if (!cardAccount) {
            await ctx.reply('Карточный счет не найден. Обратитесь к администратору.');
            return;
        }

        // Получаем случайную карту из массива
        const cards = cardAccount.cards || [cardAccount.account_number];
        const randomCard = cards.length > 0
            ? cards[Math.floor(Math.random() * cards.length)]
            : cardAccount.account_number;

        const currencySymbol = await getCurrencySymbol();
        const txid = generateTXID(order.id);
        const amountText = `${finalAmount.toLocaleString('ru-RU')} ${currencySymbol}`;
        paymentDetails = generatePaymentRequestText(order.id, txid, amountText, randomCard);
    } else {
        const address = await paymentService.getPaymentAddress(methodId);

        if (!address) {
            await ctx.reply('Адрес оплаты не настроен. Обратитесь к администратору.');
            return;
        }

        // Для криптовалюты конвертируем рубли в криптовалюту (с учетом наценки)
        const conversion = await cryptoExchangeService.convertRublesToCrypto(finalAmount, method.network);

        if (conversion.error) {
            await ctx.reply(`❌ Ошибка при конвертации: ${conversion.error}`);
            return;
        }

        const cryptoAmount = conversion.amount;
        const cryptoSymbol = cryptoExchangeService.getCryptoSymbol(method.network);
        const formattedCryptoAmount = cryptoExchangeService.formatCryptoAmount(cryptoAmount, method.network);

        const txid = generateTXID(order.id);
        const amountText = `${formattedCryptoAmount} ${cryptoSymbol}`;
        paymentDetails = generatePaymentRequestText(order.id, txid, amountText, address);
    }

    const text = paymentDetails;

    await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Поддержка', callback_data: `order_support_${orderId}` }],
                [{ text: '📋 Скопировать реквизиты 📋', callback_data: `copy_payment_details_${orderId}` }],
                [{ text: 'Отменить заявку', callback_data: `cancel_order_${orderId}` }]
            ]
        }
    });
}
