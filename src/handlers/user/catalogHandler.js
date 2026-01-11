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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Хранит пользователей, которые вводят промокод (userId -> productId)
export const promocodeInputMode = new Map();

// Переменная для notificationService (будет установлена извне)
let notificationService = null;

export function setNotificationService(service) {
    notificationService = service;
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

    // Обработка выбора города
    bot.action(/^city_(\d+)$/, async (ctx) => {
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });
        const cityId = parseInt(ctx.match[1]);
        await showDistrictsMenu(ctx, cityId);
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

    const keyboard = cities.map(city => [
        { text: `${cityIcon} ${city.name}`, callback_data: `city_${city.id}` }
    ]);

    keyboard.push([{ text: 'Вернуться назад', callback_data: 'back_to_storefront' }]);

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
    const keyboard = products.map(product => {
        const packagingLabel = product.packaging_value
            ? ` (${product.packaging_value} кг)`
            : '';
        return [
            {
                text: `${product.name}${packagingLabel} - ${product.price.toLocaleString('ru-RU')} ${currencySymbol}`,
                callback_data: `product_${product.id}`
            }
        ];
    });

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

    const packagingLabel = product.packaging_value ? ` ${product.packaging_value}г` : '';

    // Формируем текст в новом формате
    const currencySymbol = await getCurrencySymbol();
    const text = `Вы выбрали: ${product.name}${packagingLabel}


<b>Цена (без комиссии):</b> ${product.price.toLocaleString('ru-RU')} ${currencySymbol}
<b>Описание:</b> ${product.description || 'Описание отсутствует'}

❔ У вас есть промо-код ❔`;

    const keyboard = [
        [{ text: '✏️ Ввести промо', callback_data: `enter_promo_${product.id}` }],
        [{ text: '🙅‍♂️ Продолжить без промо', callback_data: `continue_no_promo_${product.id}` }],
        [{ text: '🔙 Назад', callback_data: `back_to_products_${district.id}` }]
    ];

    // Определяем путь к изображению
    let photoPath = null;
    if (product.image_path) {
        if (product.image_path.startsWith('./') || product.image_path.startsWith('../')) {
            photoPath = join(__dirname, '../../..', product.image_path);
        } else if (product.image_path.startsWith('src/')) {
            photoPath = join(__dirname, '../../..', product.image_path);
        } else {
            photoPath = product.image_path;
        }
    } else {
        const defaultImagePath = join(__dirname, '../../..', 'src/assets/img/placeholder_photo.png');
        if (existsSync(defaultImagePath)) {
            photoPath = defaultImagePath;
        }
    }

    const replyMarkup = {
        inline_keyboard: keyboard
    };

    // Если есть фото, отправляем его с текстом, иначе только текст
    if (photoPath && existsSync(photoPath)) {
        try {
            if (ctx.callbackQuery) {
                await ctx.deleteMessage();
            }
            await ctx.replyWithPhoto(
                { source: photoPath },
                {
                    caption: text,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                }
            );
        } catch (error) {
            console.error('[CatalogHandler] Ошибка при отправке фото:', error);
            if (ctx.callbackQuery) {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
            } else {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
            }
        }
    } else {
        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        }
    }
}

/**
 * Создание заказа
 */
export async function createOrder(ctx, productId, promocodeId = null) {
    try {
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

        const packagingLabel = order.packaging_value ? ` ${order.packaging_value}г` : '';
        const promocodeText = order.promocode_code ? order.promocode_code : 'Нет';
        const currencySymbol = await getCurrencySymbol();
        const discountText = order.discount > 0 ? `${order.discount.toLocaleString('ru-RU')} ${currencySymbol}` : `0 ${currencySymbol}`;

        const storefrontName = await settingsService.getStorefrontName();
        const text = `<b>Создан заказ #12${order.id}</b>

<b>Витрина:</b> ${storefrontName} 
<b>Категория:</b> ${order.city_name} 
<b>Раздел:</b> ${order.district_name} 

<b>Товар:</b> ${order.product_name} ${packagingLabel} 
<b>Кол-во:</b> 1 
<b>Стоимость:</b> ${order.price.toLocaleString('ru-RU')} ${currencySymbol} 

<b>Промокод:</b> ${promocodeText} 
<b>Скидка:</b> ${discountText} 
<b>Финальная сумма:</b> ${order.total_price.toLocaleString('ru-RU')} <b><i>${currencySymbol}</i></b>`;

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
    if (notificationService) {
        await notificationService.notifyPaymentMethodSelected(orderId, method.name);
    }

    // Обновляем активность пользователя
    await userService.saveOrUpdate(ctx.from.id, {
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
    });

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
        const amountText = `${order.total_price.toLocaleString('ru-RU')} ${currencySymbol}`;
        paymentDetails = generatePaymentRequestText(order.id, txid, amountText, randomCard);
    } else {
        const address = await paymentService.getPaymentAddress(methodId);

        if (!address) {
            await ctx.reply('Адрес оплаты не настроен. Обратитесь к администратору.');
            return;
        }

        // Для криптовалюты конвертируем рубли в криптовалюту
        const conversion = await cryptoExchangeService.convertRublesToCrypto(order.total_price, method.network);

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
                [{ text: '✅ Оплатил', callback_data: `confirm_payment_${orderId}` }],
                [{ text: '◀️ Назад', callback_data: `back_to_cities` }]
            ]
        }
    });
}
