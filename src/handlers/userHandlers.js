import { cityService } from '../services/cityService.js';
import { districtService } from '../services/districtService.js';
import { productService } from '../services/productService.js';
import { paymentService } from '../services/paymentService.js';
import { cardAccountService } from '../services/cardAccountService.js';
import { userService } from '../services/userService.js';
import { supportService } from '../services/supportService.js';
import { settingsService } from '../services/settingsService.js';
import { menuButtonService } from '../services/menuButtonService.js';
import { promocodeService } from '../services/promocodeService.js';
import { statisticsService } from '../services/statisticsService.js';
import { referralService } from '../services/referralService.js';
import { orderService } from '../services/orderService.js';
import { reviewService } from '../services/reviewService.js';
import { cryptoExchangeService } from '../services/cryptoExchangeService.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Хранит пользователей, которые находятся в режиме поддержки
const supportMode = new Map();
// Хранит пользователей, которые вводят промокод (userId -> productId)
const promocodeInputMode = new Map();
// Хранит пользователей, которые вводят сумму пополнения (userId -> methodId)
const topupAmountMode = new Map();

// Импортируем adminSessions для проверки, является ли пользователь админом
let adminSessions = null;

// Функция для установки adminSessions (вызывается из adminHandlers)
export function setAdminSessions(sessions) {
    adminSessions = sessions;
}

// Функция для проверки, является ли пользователь админом
function isAdmin(userId) {
    return adminSessions && adminSessions.has(userId);
}

// Функция для получения reply keyboard с кнопками меню
async function getMenuKeyboard() {
    // Получаем количество отзывов
    const reviews = await reviewService.getAllReviews();
    const reviewsCount = reviews.length;
    const reviewsButtonText = reviewsCount > 0 ? `📨 Отзывы (${reviewsCount})` : '📨 Отзывы';

    const topButtons = [
        ['♻️ Каталог', '⚙️ Мой кабинет'],
        [reviewsButtonText]
    ];

    // Получаем динамические кнопки из БД
    const menuButtons = await menuButtonService.getAll(true);

    // Группируем динамические кнопки по 2 в ряд (50% ширины каждая)
    const dynamicButtons = [];
    for (let i = 0; i < menuButtons.length; i += 2) {
        const row = menuButtons.slice(i, i + 2).map(btn => btn.name);
        dynamicButtons.push(row);
    }

    // Объединяем верхние кнопки и динамические
    const keyboard = [...topButtons, ...dynamicButtons];

    return {
        keyboard: keyboard,
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

// Функция для показа reply keyboard (скрывает для админов)
async function showMenuKeyboard(ctx) {
    // Если пользователь админ, не показываем кнопки меню
    if (isAdmin(ctx.from.id)) {
        return;
    }

    const keyboard = await getMenuKeyboard();
    await ctx.reply('🕹 Главное меню:', {
        reply_markup: keyboard
    });
}

let notificationService = null;

export function setupUserHandlers(bot) {
    console.log('[UserHandlers] Настройка пользовательских обработчиков...');

    // Инициализируем notificationService с bot
    (async () => {
        const { NotificationService } = await import('../services/notificationService.js');
        notificationService = new NotificationService(bot);
    })();
    // Главное меню - выбор города
    bot.start(async (ctx) => {
        console.log('[UserHandlers] ========== Команда /start получена ==========');
        console.log('[UserHandlers] Пользователь ID:', ctx.from.id);
        console.log('[UserHandlers] Username:', ctx.from.username);
        console.log('[UserHandlers] Имя:', ctx.from.first_name);
        try {
            // Проверяем, есть ли реферальный код в параметрах
            const startParam = ctx.message.text.split(' ')[1];
            if (startParam && startParam.startsWith('ref_')) {
                const referralCode = startParam.replace('ref_', '');
                const referrerChatId = await referralService.getChatIdByCode(referralCode);

                if (referrerChatId && referrerChatId !== ctx.from.id) {
                    // Создаем реферальную связь
                    await referralService.createReferral(referrerChatId, ctx.from.id);
                    console.log(`[UserHandlers] Пользователь ${ctx.from.id} зарегистрирован как реферал пользователя ${referrerChatId}`);
                }
            }

            // Сохраняем пользователя в БД
            console.log('[UserHandlers] Сохранение пользователя в БД...');
            await userService.saveOrUpdate(ctx.from.id, {
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name
            });
            console.log('[UserHandlers] Пользователь сохранен');

            // Получаем и показываем приветственное сообщение
            console.log('[UserHandlers] Получение приветственного сообщения...');
            const welcomeMessage = await settingsService.getWelcomeMessage();
            console.log('[UserHandlers] Отправка приветственного сообщения...');
            // Отправляем сообщение с поддержкой HTML разметки
            await ctx.reply(welcomeMessage, {
                parse_mode: 'HTML',
                disable_web_page_preview: false
            });

            // Показываем reply keyboard с кнопками меню (если пользователь не админ)
            await showMenuKeyboard(ctx);
        } catch (error) {
            console.error('[UserHandlers] ОШИБКА в обработчике /start:', error);
            console.error('[UserHandlers] Stack:', error.stack);
            if (ctx.reply) {
                await ctx.reply('Произошла ошибка при обработке команды. Попробуйте позже.');
            }
        }
    });
    console.log('[UserHandlers] Обработчик /start зарегистрирован');

    // Команда /catalog - каталог товаров (показ меню витрины)
    bot.command('catalog', async (ctx) => {
        console.log('[UserHandlers] Команда /catalog получена');
        try {
            await userService.saveOrUpdate(ctx.from.id, {
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name
            });
            await showStorefrontMenu(ctx);
        } catch (error) {
            console.error('[UserHandlers] ОШИБКА в обработчике /catalog:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    });
    console.log('[UserHandlers] Обработчик /catalog зарегистрирован');

    // Команда /cabinet - личный кабинет
    bot.command('cabinet', async (ctx) => {
        console.log('[UserHandlers] Команда /cabinet получена');
        await showCabinetMenu(ctx);
    });
    console.log('[UserHandlers] Обработчик /cabinet зарегистрирован');

    // Обработчик кнопки личного кабинета
    bot.action('cabinet_menu', async (ctx) => {
        await showCabinetMenu(ctx);
    });

    // Обработчик кнопки "Пополнить"
    bot.action('topup_balance', async (ctx) => {
        await showTopupMenu(ctx);
    });

    // Обработчик кнопки "Мои заказы"
    bot.action('my_orders', async (ctx) => {
        await showMyOrders(ctx);
    });

    // Обработчик кнопки "История пополнений"
    bot.action('topup_history', async (ctx) => {
        await showTopupHistory(ctx);
    });

    // Обработчик кнопки "Мои рефералы"
    bot.action('my_referrals', async (ctx) => {
        await showReferrals(ctx);
    });

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
    bot.action(/^pay_order_(\d+)_(\d+)$/, async (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        const methodId = parseInt(ctx.match[2]);
        await showPaymentAddressForOrder(ctx, orderId, methodId);
    });

    // Обработка выбора метода пополнения баланса в личном кабинете
    bot.action(/^topup_method_(\d+)$/, async (ctx) => {
        const methodId = parseInt(ctx.match[1]);
        await showTopupMethod(ctx, methodId);
    });

    // Обработка кнопки "Скопировать реквизиты" для пополнения
    bot.action(/^copy_topup_(\d+)$/, async (ctx) => {
        const topupId = parseInt(ctx.match[1]);
        const { database } = await import('../database/db.js');
        try {
            const topup = await database.get(
                'SELECT t.*, pm.type, pm.network, pa.address, ca.account_number FROM topups t ' +
                'LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id ' +
                'LEFT JOIN payment_addresses pa ON pa.payment_method_id = t.payment_method_id AND pa.id = (SELECT id FROM payment_addresses WHERE payment_method_id = t.payment_method_id ORDER BY created_at DESC LIMIT 1) ' +
                'LEFT JOIN card_accounts ca ON ca.id = (SELECT id FROM card_accounts WHERE enabled = 1 ORDER BY RANDOM() LIMIT 1) ' +
                'WHERE t.id = ?',
                [topupId]
            );

            if (!topup) {
                await ctx.answerCbQuery('Заявка не найдена');
                return;
            }

            const address = topup.type === 'card' ? topup.account_number : topup.address;
            if (address) {
                await ctx.answerCbQuery(`Реквизиты: ${address}`);
                await ctx.reply(`<code>${address}</code>`, { parse_mode: 'HTML' });
            } else {
                await ctx.answerCbQuery('Реквизиты не найдены');
            }
        } catch (error) {
            console.error('[UserHandlers] Ошибка при копировании реквизитов:', error);
            await ctx.answerCbQuery('Ошибка при копировании реквизитов');
        }
    });

    // Обработка кнопки "Отменить заявку"
    bot.action(/^cancel_topup_(\d+)$/, async (ctx) => {
        const topupId = parseInt(ctx.match[1]);
        const { database } = await import('../database/db.js');
        try {
            await database.run(
                'UPDATE topups SET status = ? WHERE id = ?',
                ['cancelled', topupId]
            );
            await ctx.answerCbQuery('Заявка отменена');
            await ctx.editMessageText('❌ Заявка на пополнение отменена.');

            // Возвращаем обычные кнопки меню
            const menuKeyboard = await getMenuKeyboard();
            await ctx.reply('🕹 Главное меню:', {
                reply_markup: menuKeyboard
            });
        } catch (error) {
            console.error('[UserHandlers] Ошибка при отмене заявки:', error);
            await ctx.answerCbQuery('Ошибка при отмене заявки');
        }
    });

    // Вернуться к витрине
    bot.action('back_to_storefront', async (ctx) => {
        try {
            await showStorefrontMenu(ctx);
        } catch (error) {
            console.error('[UserHandlers] Ошибка при возврате к витрине:', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    });

    // Вернуться к городам
    bot.action('back_to_cities', async (ctx) => {
        try {
            await showCitiesMenu(ctx);
        } catch (error) {
            // Если не удалось изменить сообщение, отправляем новое
            // Получаем иконку для городов из настроек
            const cityIcon = await settingsService.getCityIcon();
            await ctx.reply('🛍 Каталог товаров::', {
                reply_markup: {
                    inline_keyboard: (await cityService.getAll()).map(city => [
                        { text: `${cityIcon} ${city.name}`, callback_data: `city_${city.id}` }
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

    // Обработка кнопки "Помощь"
    bot.action('help_support', async (ctx) => {
        await showHelpMenu(ctx);
    });

    // Обработка текстовых сообщений от пользователей (когда они пишут в поддержку)
    // ВАЖНО: Этот обработчик должен регистрироваться ПЕРЕД bot.hears(),
    // чтобы он мог обработать динамические кнопки до того, как bot.hears() перехватит их
    bot.on('text', async (ctx, next) => {
        console.log('[UserHandlers] bot.on(text) вызван для текста:', ctx.message.text);

        // Пропускаем команды - они должны обрабатываться через bot.command()
        if (ctx.message.text && ctx.message.text.startsWith('/')) {
            console.log('[UserHandlers] bot.on(text): Пропуск команды (передаем дальше):', ctx.message.text);
            return next(); // позволяем другим middleware (командам) обработать
        }

        // Проверяем, находится ли пользователь в режиме поддержки
        if (supportMode.has(ctx.from.id)) {
            // Сохраняем сообщение пользователя
            await userService.saveOrUpdate(ctx.from.id, {
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name
            });

            await supportService.saveUserMessage(ctx.from.id, ctx.message.text);
            await ctx.reply('✅ Ваше сообщение отправлено в поддержку. Мы свяжемся с вами как можно быстрее!');
            supportMode.delete(ctx.from.id);
            return;
        }

        // Обработка ввода суммы пополнения
        if (topupAmountMode.has(ctx.from.id)) {
            const methodId = topupAmountMode.get(ctx.from.id);
            const amountText = ctx.message.text.trim().replace(/[^\d.,]/g, '').replace(',', '.');
            const amount = parseFloat(amountText);

            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Неверная сумма. Введите число больше нуля.\n\nНапример: 1000', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Отмена', callback_data: 'topup_balance' }]
                        ]
                    }
                });
                return;
            }

            topupAmountMode.delete(ctx.from.id);

            // Обновляем запись о пополнении с указанной суммой
            const { database } = await import('../database/db.js');
            try {
                // Ищем последнюю запись о пополнении для этого пользователя и метода
                const lastTopup = await database.get(
                    'SELECT * FROM topups WHERE user_chat_id = ? AND payment_method_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
                    [ctx.from.id, methodId, 'pending']
                );

                if (lastTopup) {
                    // Обновляем существующую запись
                    await database.run(
                        'UPDATE topups SET amount = ? WHERE id = ?',
                        [amount, lastTopup.id]
                    );
                    console.log('[UserHandlers] Обновлена запись о пополнении ID:', lastTopup.id, 'Сумма:', amount);
                } else {
                    // Создаем новую запись, если не нашли
                    const result = await database.run(
                        'INSERT INTO topups (user_chat_id, amount, payment_method_id, status) VALUES (?, ?, ?, ?)',
                        [ctx.from.id, amount, methodId, 'pending']
                    );
                    console.log('[UserHandlers] Создана запись о пополнении с ID:', result.lastID, 'Сумма:', amount);
                }
            } catch (error) {
                console.error('[UserHandlers] Ошибка при обновлении/создании записи о пополнении:', error);
            }

            await showTopupMethod(ctx, methodId, amount);
            return;
        }

        // Обработка ввода промокода
        if (promocodeInputMode.has(ctx.from.id)) {
            const productId = promocodeInputMode.get(ctx.from.id);
            const promocodeText = ctx.message.text.trim().toUpperCase();

            // Валидация промокода
            const validation = await promocodeService.validatePromocodeForUser(ctx.from.id, promocodeText);
            if (!validation.valid) {
                await ctx.reply(`❌ ${validation.reason}\n\nПопробуйте ввести промо-код еще раз или нажмите "Продолжить без промо".`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Вернуться к товару', callback_data: `back_to_product_${productId}` }]
                        ]
                    }
                });
                return;
            }

            // Создаем заказ с промокодом
            await createOrder(ctx, productId, validation.promocode.id);
            promocodeInputMode.delete(ctx.from.id);
            return;
        }

        // Обработка нажатия на кнопку метода оплаты (reply keyboard)
        const paymentMethods = await paymentService.getAllMethods();
        const clickedPaymentMethod = paymentMethods.find(method => method.name === ctx.message.text);

        if (clickedPaymentMethod) {
            console.log('[UserHandlers] Нажата кнопка метода оплаты:', clickedPaymentMethod.name);
            await showTopupMethod(ctx, clickedPaymentMethod.id);
            return;
        }

        // Обработка динамических кнопок меню
        console.log('[UserHandlers] Проверка динамических кнопок для текста:', ctx.message.text);
        const menuButtons = await menuButtonService.getAll(true);
        console.log('[UserHandlers] Найдено динамических кнопок:', menuButtons.length);
        console.log('[UserHandlers] Названия кнопок:', menuButtons.map(btn => btn.name));

        const clickedButton = menuButtons.find(btn => btn.name === ctx.message.text);
        console.log('[UserHandlers] Найдена кнопка?', !!clickedButton);

        if (clickedButton) {
            console.log('[UserHandlers] Обработка нажатия на кнопку:', clickedButton.name);
            await userService.saveOrUpdate(ctx.from.id, {
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name
            });
            await ctx.reply(clickedButton.message, { parse_mode: 'HTML' });
            return;
        }

        // Если не обработано, передаем дальше к bot.hears()
        console.log('[UserHandlers] Текст не обработан, передаем дальше к bot.hears()');
        return next();
    });

    // Обработчики для текстовых кнопок меню (с иконками и без)
    bot.hears(['♻️ Каталог', 'Каталог'], async (ctx) => {
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });
        await showStorefrontMenu(ctx);
    });

    bot.hears(['⚙️ Мой кабинет', 'Мой кабинет'], async (ctx) => {
        await showCabinetMenu(ctx);
    });

    bot.hears(['📨 Помощь', 'Помощь'], async (ctx) => {
        await showHelpMenu(ctx);
    });

    // Обработка кнопки "Отзывы" (может быть с количеством или без)
    bot.hears(/^📨 Отзывы( \(\d+\))?$/, async (ctx) => {
        await showReviews(ctx, 1);
    });

    // Также обрабатываем старый формат для совместимости
    bot.hears(['🛟 Отзывы', 'Отзывы'], async (ctx) => {
        await showReviews(ctx, 1);
    });

    // Обработка пагинации отзывов
    bot.action(/^reviews_page_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            await showReviews(ctx, page);
        } catch (error) {
            console.error('[UserHandlers] Ошибка при обработке пагинации отзывов:', error);
            await ctx.answerCbQuery('Ошибка при загрузке страницы');
        }
    });

    // Обработчик для текущей страницы (неактивная кнопка)
    bot.action('reviews_current', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('[UserHandlers] Ошибка при обработке reviews_current:', error);
        }
    });
}

// Показ отзывов с пагинацией
async function showReviews(ctx, page = 1) {
    try {
        console.log('[UserHandlers] Запрос отзывов, страница:', page);
        const { reviews, currentPage, totalPages } = await reviewService.getAll(page, 5);
        console.log('[UserHandlers] Получено отзывов:', reviews.length, 'Всего страниц:', totalPages);

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
            // Форматируем звезды
            const stars = '⭐️'.repeat(review.rating);

            // Безопасное форматирование даты
            let formattedDate = review.review_date;
            if (review.review_date && typeof review.review_date === 'string') {
                try {
                    formattedDate = review.review_date.split('-').reverse().join('.');
                } catch (dateError) {
                    console.error('[UserHandlers] Ошибка при форматировании даты:', dateError);
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
                console.error('[UserHandlers] Ошибка при редактировании сообщения с отзывами:', error);
                try {
                    await ctx.reply(text, {
                        reply_markup: { inline_keyboard: keyboard }
                    });
                    await ctx.answerCbQuery();
                } catch (replyError) {
                    console.error('[UserHandlers] Ошибка при отправке нового сообщения с отзывами:', replyError);
                    await ctx.answerCbQuery('Ошибка при отображении отзывов');
                }
            }
        } else {
            await ctx.reply(text, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    } catch (error) {
        console.error('[UserHandlers] Ошибка при показе отзывов:', error);
        console.error('[UserHandlers] Stack trace:', error.stack);
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('Ошибка при загрузке отзывов');
            }
            await ctx.reply('Произошла ошибка при загрузке отзывов. Попробуйте позже.');
        } catch (replyError) {
            console.error('[UserHandlers] Ошибка при отправке сообщения об ошибке:', replyError);
        }
    }
}

async function showCabinetMenu(ctx) {
    try {
        console.log('[UserHandlers] showCabinetMenu вызван');
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });

        const user = await userService.getByChatId(ctx.from.id);
        const balance = user?.balance || 0;

        const text = `👤 ${ctx.from.username ? '@' + ctx.from.username : 'Не указано'}
💵 <b>Баланс: ${balance.toFixed(2)} ₽</b>`;

        //         const text = `👤 <b>Личный кабинет</b>

        // 🆔 ID: <code>${ctx.from.id}</code>
        // 👤 Имя: ${ctx.from.first_name || 'Не указано'} ${ctx.from.last_name || ''}
        // 📱 Username: ${ctx.from.username ? '@' + ctx.from.username : 'Не указано'}
        // 📅 Дата регистрации: ${user?.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : 'Неизвестно'}
        // 🕐 Последняя активность: ${user?.last_active ? new Date(user.last_active).toLocaleDateString('ru-RU') + ' ' + new Date(user.last_active).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Неизвестно'}

        // 💰 <b>Баланс: ${balance.toFixed(2)} ₽</b>`;

        const keyboard = [
            [{ text: '💳 Пополнить', callback_data: 'topup_balance' }],
            [{ text: '🌶 Реферальная система', callback_data: 'my_referrals' }],
            [{ text: '📦 Мои заказы', callback_data: 'my_orders' }],
            [{ text: '💰 История пополнений', callback_data: 'topup_history' }],
        ];

        const replyMarkup = {
            inline_keyboard: keyboard
        };

        console.log('[UserHandlers] Отправка меню кабинета, keyboard:', JSON.stringify(keyboard));
        console.log('[UserHandlers] Это callback?', !!ctx.callbackQuery);

        // Если это callback (кнопка), используем editMessageText
        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                console.log('[UserHandlers] Меню кабинета отправлено через editMessageText');
            } catch (error) {
                console.error('[UserHandlers] Ошибка при editMessageText:', error);
                // Если не удалось изменить, отправляем новое сообщение
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                console.log('[UserHandlers] Меню кабинета отправлено через reply (fallback)');
            }
        } else {
            // Если это команда, используем reply
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
            console.log('[UserHandlers] Меню кабинета отправлено через reply');
        }
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в showCabinetMenu:', error);
        console.error('[UserHandlers] Stack:', error.stack);
        try {
            if (ctx.callbackQuery) {
                await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
            } else {
                await ctx.reply('Произошла ошибка. Попробуйте позже.');
            }
        } catch (e) {
            console.error('[UserHandlers] Ошибка при отправке сообщения об ошибке:', e);
        }
    }
}

async function showTopupMenu(ctx) {
    try {
        const paymentMethods = await paymentService.getAllMethods();

        if (paymentMethods.length === 0) {
            if (ctx.callbackQuery) {
                await ctx.editMessageText('❌ Методы оплаты пока не настроены. Обратитесь к администратору.');
            } else {
                await ctx.reply('❌ Методы оплаты пока не настроены. Обратитесь к администратору.');
            }
            return;
        }

        const text = `💵 Выберите способ пополнения:`;

        // Создаем reply keyboard с методами оплаты (каждая кнопка в отдельном ряду для 100% ширины)
        const keyboard = [];
        for (const method of paymentMethods) {
            keyboard.push([method.name]); // Каждая кнопка в отдельном ряду
        }

        const replyMarkup = {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: false
        };

        // Отправляем сообщение с reply keyboard
        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
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
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в showTopupMenu:', error);
        if (ctx.callbackQuery) {
            await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}

// Показ реквизитов для выбранного метода пополнения
async function showTopupMethod(ctx, methodId, amount = null) {
    try {
        const method = await paymentService.getMethodById(methodId);
        if (!method) {
            await ctx.reply('Метод оплаты не найден.');
            return;
        }

        // Если сумма не указана, запрашиваем её и создаем запись в БД
        if (amount === null) {
            topupAmountMode.set(ctx.from.id, methodId);

            // Создаем запись о пополнении сразу при выборе метода (с суммой 0, потом обновим)
            const { database } = await import('../database/db.js');
            try {
                const result = await database.run(
                    'INSERT INTO topups (user_chat_id, amount, payment_method_id, status) VALUES (?, ?, ?, ?)',
                    [ctx.from.id, 0, methodId, 'pending']
                );
                console.log('[UserHandlers] Создана предварительная запись о пополнении с ID:', result.lastID);
            } catch (error) {
                console.error('[UserHandlers] Ошибка при создании предварительной записи о пополнении:', error);
            }

            // Убираем reply keyboard с методами оплаты при запросе суммы
            await ctx.reply(
                '💵 Введите сумму пополнения (В рублях):\n\n',

                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        remove_keyboard: true
                    }
                }
            );
            return;
        }

        // Показываем сообщение об ожидании получения реквизитов
        const waitingMsg = await ctx.reply('🕗 Ожидание получения реквизитов..');

        // Добавляем задержку перед показом блока с заявкой (3 секунды)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Обновляем запись о пополнении с указанной суммой (запись уже создана при выборе метода)
        const { database } = await import('../database/db.js');
        let topupId = null;
        try {
            // Ищем последнюю запись о пополнении для этого пользователя и метода
            const lastTopup = await database.get(
                'SELECT * FROM topups WHERE user_chat_id = ? AND payment_method_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
                [ctx.from.id, methodId, 'pending']
            );

            if (lastTopup && lastTopup.amount === 0) {
                // Обновляем существующую запись с суммой 0
                await database.run(
                    'UPDATE topups SET amount = ? WHERE id = ?',
                    [amount, lastTopup.id]
                );
                topupId = lastTopup.id;
                console.log('[UserHandlers] Обновлена запись о пополнении ID:', lastTopup.id, 'Сумма:', amount);
            } else if (!lastTopup) {
                // Если записи нет, создаем новую
                const result = await database.run(
                    'INSERT INTO topups (user_chat_id, amount, payment_method_id, status) VALUES (?, ?, ?, ?)',
                    [ctx.from.id, amount, methodId, 'pending']
                );
                topupId = result.lastID;
                console.log('[UserHandlers] Создана запись о пополнении с ID:', result.lastID, 'Сумма:', amount);
            } else {
                topupId = lastTopup.id;
            }
        } catch (error) {
            console.error('[UserHandlers] Ошибка при обновлении/создании записи о пополнении:', error);
            console.error('[UserHandlers] Stack trace:', error.stack);
        }

        // Генерируем TXID для отображения
        function generateTXID(id) {
            const hex = id.toString(16).padStart(8, '0');
            let hash = id;
            for (let i = 0; i < 3; i++) {
                hash = ((hash * 1103515245) + 12345) & 0x7fffffff;
            }
            const hashHex = hash.toString(16).padStart(8, '0');
            const part1 = hex.substring(0, 2);
            const part2 = hex.substring(2, 6);
            const part3 = hashHex.substring(0, 4);
            const part4 = hashHex.substring(4, 8);
            const part5 = (hex + hashHex).substring(0, 4);
            const part6 = (hex + hashHex).substring(4, 16);
            return `gt${part1}-${part2}-${part3}-${part4}-${part5}-${part6}`;
        }

        let text = '';
        let cryptoAmount = null;
        let cryptoSymbol = '';

        if (method.type === 'card') {
            const cardAccount = await cardAccountService.getRandom();
            if (!cardAccount) {
                await ctx.reply('Карточные счета не настроены. Обратитесь к администратору.');
                return;
            }

            const txid = topupId ? generateTXID(topupId) : 'None';
            text = `<b>Создана заявка #${topupId || 'N/A'}</b>\n\n` +
                `TxID: <code>${txid}</code>\n\n` +
                `💵 Переведите: <code>${amount.toLocaleString('ru-RU')}</code> ₽\n\n` +
                `💳 <b>Реквизиты для оплаты:</b>\n<code>${cardAccount.account_number}</code>\n\n` +
                `Если Вы оплатили неверную сумму или не успели провести оплату вовремя, отпишите в поддержку.\n` +
                `‼️ Контакт указан в кнопке ниже "Поддержка".\n` +
                `Оплачивайте точную сумму в заявке, иначе рискуете потерять деньги.\n` +
                `Время на оплату - 30 минут, если не успеваете пересоздайте заявку.\n` +
                `https://bestchange.com - инструкция 🫱 - https://telegra.ph/INSTRUKCIYA-PO-OPLATE-LTC-CHEREZ-07-16\n` +
                `@bot_abcobmen_bot - инструкция 🫱 https://telegra.ph/Kak-obmenyat-rubli-na-Litecoin-cherez-obmennik-bota-07-12\n` +
                `@BTC_MONOPOLY_BTC_BOT- инструкция 🫱 https://telegra.ph/Instrukciya-po-obmenu-LTC--BTC-07-12\n` +
                `https://sova.gg/ - инструкция 🫱 https://telegra.ph/Instrukciya-po-obmenu-LTC--BTC-cherez-sajt-sovagg-07-12\n` +
                `https://alt-coin.cc/ - инструкция 🫱 https://telegra.ph/Instrukciya-po-obmenu-LTC--BTC-cherez-sajt-alt-coincc-07-12\n` +
                `https://pocket-exchange.com/ инструкция🫱  https://telegra.ph/Instrukciya-po-obmenu-LTC--BTC-cherez-sajt-pocket-exchangecom-07-12`
        } else {
            // Для криптовалюты конвертируем рубли в криптовалюту
            const conversion = await cryptoExchangeService.convertRublesToCrypto(amount, method.network);

            if (conversion.error) {
                await ctx.reply(`❌ Ошибка при конвертации: ${conversion.error}`);
                return;
            }

            cryptoAmount = conversion.amount;
            cryptoSymbol = cryptoExchangeService.getCryptoSymbol(method.network);
            const formattedCryptoAmount = cryptoExchangeService.formatCryptoAmount(cryptoAmount, method.network);

            const address = await paymentService.getAddressForMethod(methodId);
            if (!address) {
                await ctx.reply('Адрес для пополнения не найден. Обратитесь к администратору.');
                return;
            }

            const txid = topupId ? generateTXID(topupId) : 'None';
            text = `<b>Создана заявка #${topupId || 'N/A'}</b>\n\n` +
                `TxID: <code>${txid}</code>\n\n` +
                `💵 Переведите: <code>${formattedCryptoAmount}</code> ${cryptoSymbol}\n\n` +
                `💳 <b>Реквизиты для оплаты:</b>\n<code>${address.address}</code>\n\n` +
                `Если Вы оплатили неверную сумму или не успели провести оплату вовремя, отпишите в поддержку.\n` +
                `‼️ Контакт указан в кнопке ниже "Поддержка".\n` +
                `Оплачивайте точную сумму в заявке, иначе рискуете потерять деньги.\n` +
                `Время на оплату - 30 минут, если не успеваете пересоздайте заявку.`;
        }

        // Создаем кнопки согласно изображению
        const replyMarkup = {
            inline_keyboard: [
                [{ text: 'Поддержка', callback_data: 'help_support' }],
                [{ text: '📋 Скопировать реквизиты', callback_data: `copy_topup_${topupId || '0'}` }],
                [{ text: 'Отменить заявку', callback_data: `cancel_topup_${topupId || '0'}` }]
            ]
        };

        // Отправляем уведомление о выборе реквизита для пополнения баланса
        if (notificationService) {
            await notificationService.notifyTopupRequest(ctx.from.id, method.name);
        }

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
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в showTopupMethod:', error);
        if (ctx.callbackQuery) {
            await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}

async function showMyOrders(ctx) {
    try {
        const orders = await getOrdersByUser(ctx.from.id);

        if (orders.length === 0) {
            const text = `📄 Список заказов:\n\nУ вас пока нет заказов.`;

            if (ctx.callbackQuery) {
                try {
                    await ctx.answerCbQuery();
                    await ctx.editMessageText(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                } catch (error) {
                    await ctx.reply(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                }
            } else {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                        ]
                    }
                });
            }
            return;
        }

        // Форматируем дату в формат "22:57 10.01.2026"
        function formatOrderDate(dateString) {
            const date = new Date(dateString);
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${hours}:${minutes} ${day}.${month}.${year}`;
        }

        // Отправляем заголовок
        const headerText = `📄 Список заказов:`;

        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText(headerText, {
                    parse_mode: 'HTML'
                });
            } catch (error) {
                await ctx.reply(headerText, {
                    parse_mode: 'HTML'
                });
            }
        } else {
            await ctx.reply(headerText, {
                parse_mode: 'HTML'
            });
        }

        // Отправляем каждый заказ отдельным сообщением с кнопкой
        for (const order of orders) {
            const formattedDate = formatOrderDate(order.created_at);
            const orderText = `Заказ #${order.id} | ${formattedDate}`;

            // Красная кнопка для неоплаченных, зеленая для оплаченных
            const statusIcon = order.status === 'completed' || order.status === 'paid'
                ? '🟢'
                : '🔴';

            // Текст сообщения с иконкой статуса
            const messageText = `${statusIcon} ${orderText}`;

            const keyboard = [[{
                text: orderText,
                callback_data: `view_order_${order.id}`
            }]];

            // Отправляем сообщение с текстом и кнопкой
            await ctx.reply(messageText, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в showMyOrders:', error);
        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
            } catch (e) {
                await ctx.reply('Произошла ошибка. Попробуйте позже.');
            }
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}

async function showTopupHistory(ctx) {
    try {
        const topups = await getTopupsByUser(ctx.from.id);

        if (topups.length === 0) {
            const text = `
🧾 <b>История пополнений</b>

У вас пока нет пополнений.
            `.trim();

            if (ctx.callbackQuery) {
                try {
                    await ctx.answerCbQuery();
                    await ctx.editMessageText(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                } catch (error) {
                    await ctx.reply(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                }
            } else {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                        ]
                    }
                });
            }
            return;
        }

        // Генерируем TXID на основе ID пополнения (формат: gt16-xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        function generateTXID(topupId) {
            // Преобразуем ID в hex
            const idHex = topupId.toString(16).padStart(8, '0');
            // Создаем детерминированный UUID-подобный идентификатор на основе ID
            // Используем простую хеш-функцию для генерации остальных частей
            let hash = topupId;
            for (let i = 0; i < 3; i++) {
                hash = ((hash * 1103515245) + 12345) & 0x7fffffff;
            }
            const hashHex = hash.toString(16).padStart(8, '0');
            // Формат: gt{2 цифры из ID}-{4 hex}-{4 hex}-{4 hex}-{4 hex}-{12 hex}
            const part1 = idHex.substring(0, 2);
            const part2 = idHex.substring(2, 6);
            const part3 = hashHex.substring(0, 4);
            const part4 = hashHex.substring(4, 8);
            const part5 = (idHex + hashHex).substring(0, 4);
            const part6 = (idHex + hashHex).substring(4, 16);
            return `gt${part1}-${part2}-${part3}-${part4}-${part5}-${part6}`;
        }

        // Форматируем дату в формат "17:42 08.01.2026"
        function formatDate(dateString) {
            const date = new Date(dateString);
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${hours}:${minutes} ${day}.${month}.${year}`;
        }

        // Показываем все пополнения (или можно добавить пагинацию)
        const totalTopups = topups.length;
        console.log('[UserHandlers] Количество пополнений:', totalTopups);
        console.log('[UserHandlers] Пополнения:', JSON.stringify(topups, null, 2));

        let text = `🧾 <b>История пополнений [${totalTopups}/${totalTopups}]:</b>\n\n`;

        for (const topup of topups) {
            const statusText = topup.status === 'pending' ? 'не оплачен' : topup.status === 'completed' ? 'оплачен' : 'отменен';
            const txid = generateTXID(topup.id);
            const formattedDate = formatDate(topup.created_at);

            text += `🌼 Пополнение #${topup.id} (${statusText}):\n`;
            text += `- Сумма: ${topup.amount.toLocaleString('ru-RU')} ₽\n`;
            text += `- TXID: ${txid}\n`;
            text += `- Дата: ${formattedDate}\n\n`;
        }

        console.log('[UserHandlers] Сформированный текст:', text);
        console.log('[UserHandlers] ctx.callbackQuery:', !!ctx.callbackQuery);

        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                        ]
                    }
                });
                console.log('[UserHandlers] Сообщение успешно отредактировано');
            } catch (error) {
                console.error('[UserHandlers] Ошибка при редактировании сообщения:', error);
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                        ]
                    }
                });
                console.log('[UserHandlers] Сообщение отправлено как новое');
            }
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                    ]
                }
            });
            console.log('[UserHandlers] Сообщение отправлено через reply');
        }
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в showTopupHistory:', error);
        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
            } catch (e) {
                await ctx.reply('Произошла ошибка. Попробуйте позже.');
            }
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}

async function showReferrals(ctx) {
    try {
        // Генерируем или получаем реферальную ссылку
        const referralCode = await referralService.getOrCreateReferralCode(ctx.from.id);
        const botUsername = ctx.botInfo?.username || (await ctx.telegram.getMe()).username || 'your_bot';
        const referralLink = `https://t.me/${botUsername}?start=ref_${referralCode}`;

        const text = `🌶 Ваша реферральная ссылка:\n\n${referralLink}`;

        const keyboard = [
            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
        ];

        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await ctx.reply(text, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в showReferrals:', error);
        if (ctx.callbackQuery) {
            await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}

async function getOrdersByUser(chatId) {
    const { database } = await import('../database/db.js');
    try {
        return await database.all(
            'SELECT * FROM orders WHERE user_chat_id = ? ORDER BY created_at DESC LIMIT 20',
            [chatId]
        );
    } catch (error) {
        console.error('[UserHandlers] Ошибка при получении заказов:', error);
        return [];
    }
}

async function getTopupsByUser(chatId) {
    const { database } = await import('../database/db.js');
    try {
        console.log('[UserHandlers] Запрос пополнений для пользователя:', chatId);
        const topups = await database.all(
            'SELECT * FROM topups WHERE user_chat_id = ? ORDER BY created_at DESC LIMIT 20',
            [chatId]
        );
        console.log('[UserHandlers] Получено пополнений:', topups.length);
        return topups;
    } catch (error) {
        console.error('[UserHandlers] Ошибка при получении истории пополнений:', error);
        console.error('[UserHandlers] Stack trace:', error.stack);
        return [];
    }
}

async function showHelpMenu(ctx) {
    await userService.saveOrUpdate(ctx.from.id, {
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
    });

    const text = `
💬 <b>Служба поддержки</b>

Напишите нам обращение, и мы свяжемся с вами как можно быстрее.

Просто отправьте ваше сообщение текстом, и оно будет передано администратору.
    `.trim();

    // Устанавливаем пользователя в режим поддержки
    supportMode.set(ctx.from.id, true);

    await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '◀️ Назад', callback_data: 'back_to_cities' }]
            ]
        }
    });
}

// Показ меню выбора витрины
async function showStorefrontMenu(ctx) {
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
        console.error('[UserHandlers] Ошибка при показе меню витрины:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
}

async function showCitiesMenu(ctx) {
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

    // Добавляем кнопку "Помощь"
    // keyboard.push([{ text: '💬 Помощь', callback_data: 'help_support' }]);
    // Добавляем кнопку "Назад к витрине"
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

async function showDistrictsMenu(ctx, cityId) {
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

async function showProductsMenu(ctx, districtId) {
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

    const keyboard = products.map(product => {
        const packagingLabel = product.packaging_value
            ? ` (${product.packaging_value} кг)`
            : '';
        return [
            {
                text: `${product.name}${packagingLabel} - ${product.price.toLocaleString('ru-RU')} ₽`,
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

async function showProductDetails(ctx, productId) {
    const product = await productService.getById(productId);
    if (!product) {
        await ctx.reply('Товар не найден.');
        return;
    }

    const district = await districtService.getById(product.district_id);
    const city = await cityService.getById(product.city_id);

    const packagingLabel = product.packaging_value ? ` ${product.packaging_value}г` : '';

    // Формируем текст в новом формате
    const text = `Вы выбрали: ${product.name}${packagingLabel}


<b>Цена (без комиссии):</b> ${product.price.toLocaleString('ru-RU')} ₽
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
        // Если путь относительный, делаем его абсолютным
        if (product.image_path.startsWith('./') || product.image_path.startsWith('../')) {
            photoPath = join(__dirname, '../..', product.image_path);
        } else if (product.image_path.startsWith('src/')) {
            // Если путь начинается с src/, делаем его абсолютным
            photoPath = join(__dirname, '../..', product.image_path);
        } else {
            photoPath = product.image_path;
        }
    } else {
        // Используем дефолтное изображение только если нет загруженного фото
        const defaultImagePath = join(__dirname, '../..', 'src/assets/img/placeholder_photo.png');
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
            console.error('[UserHandlers] Ошибка при отправке фото:', error);
            // Если не удалось отправить фото, отправляем только текст
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
        // Нет фото, отправляем только текст
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

// Создание заказа
async function createOrder(ctx, productId, promocodeId = null) {
    try {
        const product = await productService.getById(productId);
        if (!product) {
            await ctx.reply('Товар не найден.');
            return;
        }

        // Проверяем неоплаченные заказы старше 30 минут
        const unpaidOrders = await orderService.getUnpaidOrdersOlderThan(ctx.from.id, 30);
        if (unpaidOrders.length > 0) {
            // Уменьшаем количество попыток
            const remainingAttempts = await userService.decreaseUnpaidAttempts(ctx.from.id);
            const lastUnpaidOrder = unpaidOrders[0];
            const blockTimeHours = await settingsService.getBlockTimeHours();

            // Показываем первое предупреждение
            await ctx.reply(
                `🥲 Заявка на пополнение №${lastUnpaidOrder.id} не была вовремя оплачена.\n\n` +
                `<b>Внимание!</b> Запрещено создавать заявки на пополнение и не оплачивать их. За это Вы будете заблокированы на ${blockTimeHours} часов.\n\n` +
                `У Вас осталось ${remainingAttempts} попытки получения реквизитов.`,
                { parse_mode: 'HTML' }
            );

            // Показываем второе предупреждение
            await ctx.reply(
                '⚠️ Не спамьте заявками на пополнение, иначе вы будете заблокированы в боте!'
            );
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
        console.error('[UserHandlers] Ошибка при создании заказа:', error);
        await ctx.reply('❌ Произошла ошибка при создании заказа. Попробуйте позже.');
    }
}

// Показ деталей заказа
async function showOrderDetails(ctx, orderId) {
    try {
        const order = await orderService.getById(orderId);
        if (!order) {
            await ctx.reply('Заказ не найден.');
            return;
        }

        const packagingLabel = order.packaging_value ? ` ${order.packaging_value}г` : '';
        const promocodeText = order.promocode_code ? order.promocode_code : 'Нет';
        const discountText = order.discount > 0 ? `${order.discount.toLocaleString('ru-RU')} ₽` : '0 ₽';

        const storefrontName = await settingsService.getStorefrontName();
        const text = `<b>Создан заказ #12${order.id}</b>

<b>Витрина:</b> ${storefrontName} 
<b>Категория:</b> ${order.city_name} 
<b>Раздел:</b> ${order.district_name} 

<b>Товар:</b> ${order.product_name} ${packagingLabel} 
<b>Кол-во:</b> 1 
<b>Стоимость:</b> ${order.price.toLocaleString('ru-RU')} ₽ 

<b>Промокод:</b> ${promocodeText} 
<b>Скидка:</b> ${discountText} 
<b>Финальная сумма:</b> ${order.total_price.toLocaleString('ru-RU')} <b><i>₽</i></b>`;

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
            { text: method.name, callback_data: `pay_order_${order.id}_${method.id}` }
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
        console.error('[UserHandlers] Ошибка при показе деталей заказа:', error);
        await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
}

// Показ адреса оплаты для заказа
async function showPaymentAddressForOrder(ctx, orderId, methodId) {
    const order = await orderService.getById(orderId);
    const method = await paymentService.getMethodById(methodId);

    if (!order || !method) {
        await ctx.reply('Ошибка: заказ или метод оплаты не найден.');
        return;
    }

    // Обновляем метод оплаты в заказе
    await orderService.updatePaymentMethod(orderId, methodId);

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

    // Получаем адрес оплаты
    const address = await paymentService.getPaymentAddress(methodId);

    if (!address) {
        await ctx.reply('Адрес оплаты не настроен. Обратитесь к администратору.');
        return;
    }

    const text = `
💳 <b>Оплата заказа 12#${order.id}</b>

Метод оплаты: <b>${method.name}</b>
Сумма: <b>${order.total_price.toLocaleString('ru-RU')} ₽</b>

<b>Адрес для оплаты:</b>
<code>${address}</code>

После оплаты отправьте скриншот или подтверждение оплаты.
    `.trim();

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

async function showPaymentAddress(ctx, productId, methodId, promocodeId = null) {
    const product = await productService.getById(productId);
    const method = await paymentService.getMethodById(methodId);

    if (!product || !method) {
        await ctx.reply('Ошибка: товар или метод оплаты не найден.');
        return;
    }

    // Обновляем активность пользователя
    await userService.saveOrUpdate(ctx.from.id, {
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
    });

    // Рассчитываем цену с учетом промокода и реферальной скидки
    let finalPrice = product.price;
    let discountText = '';

    // Применяем промокод, если есть
    if (promocodeId) {
        const promocode = await promocodeService.getById(promocodeId);
        if (promocode) {
            const discount = (product.price * promocode.discount_percent) / 100;
            finalPrice = product.price - discount;
            discountText = `\n🎁 Промокод <b>${promocode.code}</b>: -${promocode.discount_percent}%\n💰 Скидка: <b>${discount.toLocaleString('ru-RU')} ₽</b>\n`;
        }
    }

    // Применяем реферальную скидку
    const referralCount = await referralService.getReferralCount(ctx.from.id);
    if (referralCount > 0) {
        const discountPercent = await settingsService.getReferralDiscountPercent();
        const maxDiscount = await settingsService.getMaxReferralDiscountPercent();
        const referralDiscountPercent = Math.min(referralCount * discountPercent, maxDiscount);
        const referralDiscount = (finalPrice * referralDiscountPercent) / 100;
        finalPrice = finalPrice - referralDiscount;
        discountText += `\n👥 Реферальная скидка: -${referralDiscountPercent.toFixed(1)}%\n💰 Скидка: <b>${referralDiscount.toLocaleString('ru-RU')} ₽</b>\n`;
    }

    let paymentText = '';

    // Если это карта, выбираем случайный карточный счет
    if (method.type === 'card') {
        const cardAccount = await cardAccountService.getRandom();
        if (!cardAccount) {
            await ctx.reply('Ошибка: карточные счета не настроены. Обратитесь к администратору.');
            return;
        }
        paymentText = `💳 <b>Оплата картой</b>\n\n📦 Товар: ${product.name}\n💰 Цена: <b>${product.price.toLocaleString('ru-RU')} ₽</b>${discountText}💰 Итого к оплате: <b>${finalPrice.toLocaleString('ru-RU')} ₽</b>\n\n💳 Карточный счет для оплаты:\n<b>${cardAccount.name}</b>\n<code>${cardAccount.account_number}</code>`;
    } else {
        // Для криптовалют получаем адрес
        const address = await paymentService.getAddressForMethod(methodId);
        if (!address) {
            await ctx.reply('Ошибка: адрес для оплаты не найден. Обратитесь к администратору.');
            return;
        }
        paymentText = `💳 <b>Оплата через ${method.name}</b>\n\n📦 Товар: ${product.name}\n💰 Цена: <b>${product.price.toLocaleString('ru-RU')} ₽</b>${discountText}💰 Итого к оплате: <b>${finalPrice.toLocaleString('ru-RU')} ₽</b>\n\n🔐 Адрес для оплаты:\n<code>${address.address}</code>\n\n⚠️ <i>Внимание! Это тестовый адрес. В реальном приложении здесь будет настоящий адрес кошелька.</i>`;
    }

    const text = `${paymentText}\n\nПосле оплаты средства будут автоматически зачислены на ваш счет.`.trim();

    // Если использован промокод, помечаем его как использованный
    if (promocodeId) {
        await promocodeService.markAsUsed(ctx.from.id, promocodeId);
    }

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '◀️ Назад к товару', callback_data: `back_to_product_${product.id}` }]
            ]
        }
    });
}

