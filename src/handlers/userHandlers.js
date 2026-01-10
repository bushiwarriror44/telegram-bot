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
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Хранит пользователей, которые находятся в режиме поддержки
const supportMode = new Map();
// Хранит пользователей, которые вводят промокод (userId -> productId)
const promocodeInputMode = new Map();

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
    const topButtons = [
        ['♻️ Каталог', '⚙️ Мой кабинет'],
        ['📨 Помощь', '🛟 Отзывы']
    ];

    // Получаем динамические кнопки из БД
    const menuButtons = await menuButtonService.getAll(true);
    const dynamicButtons = menuButtons.map(btn => [btn.name]);

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
    await ctx.reply('Выберите действие:', {
        reply_markup: keyboard
    });
}

export function setupUserHandlers(bot) {
    console.log('[UserHandlers] Настройка пользовательских обработчиков...');
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

            console.log('[UserHandlers] Показ меню городов...');
            await showCitiesMenu(ctx);
            console.log('[UserHandlers] Меню городов показано');
        } catch (error) {
            console.error('[UserHandlers] ОШИБКА в обработчике /start:', error);
            console.error('[UserHandlers] Stack:', error.stack);
            if (ctx.reply) {
                await ctx.reply('Произошла ошибка при обработке команды. Попробуйте позже.');
            }
        }
    });
    console.log('[UserHandlers] Обработчик /start зарегистрирован');

    // Команда /catalog - каталог товаров (показ меню городов)
    bot.command('catalog', async (ctx) => {
        console.log('[UserHandlers] Команда /catalog получена');
        try {
            await userService.saveOrUpdate(ctx.from.id, {
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name
            });
            await showCitiesMenu(ctx);
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

    // Обработчик генерации реферальной ссылки
    bot.action('generate_referral_link', async (ctx) => {
        try {
            const referralCode = await referralService.getOrCreateReferralCode(ctx.from.id);
            const botUsername = ctx.botInfo?.username || 'your_bot';
            const referralLink = `https://t.me/${botUsername}?start=ref_${referralCode}`;

            const text = `🔗 <b>Ваша реферальная ссылка:</b>\n\n<code>${referralLink}</code>\n\n📋 Скопируйте ссылку и отправьте другу. Когда он перейдет по ссылке и зарегистрируется, он станет вашим рефералом!`;

            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад к рефералам', callback_data: 'my_referrals' }]
                    ]
                }
            });
        } catch (error) {
            console.error('[UserHandlers] ОШИБКА в generate_referral_link:', error);
            await ctx.reply('Произошла ошибка при генерации ссылки. Попробуйте позже.');
        }
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


    // Вернуться к городам
    bot.action('back_to_cities', async (ctx) => {
        try {
            await showCitiesMenu(ctx);
        } catch (error) {
            // Если не удалось изменить сообщение, отправляем новое
            // Получаем иконку для городов из настроек
            const cityIcon = await settingsService.getCityIcon();
            await ctx.reply('🏙️ Выберите город:', {
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

    // Обработчики для текстовых кнопок меню (с иконками и без)
    bot.hears(['♻️ Каталог', 'Каталог'], async (ctx) => {
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });
        await showCitiesMenu(ctx);
    });

    bot.hears(['⚙️ Мой кабинет', 'Мой кабинет'], async (ctx) => {
        await showCabinetMenu(ctx);
    });

    bot.hears(['📨 Помощь', 'Помощь'], async (ctx) => {
        await showHelpMenu(ctx);
    });

    bot.hears(['🛟 Отзывы', 'Отзывы'], async (ctx) => {
        await ctx.reply('📝 Отзывы:\n\n(Здесь будет информация об отзывах)');
    });

    // Обработка текстовых сообщений от пользователей (когда они пишут в поддержку)
    // ВАЖНО: Этот обработчик должен регистрироваться ПОСЛЕ всех bot.command(),
    // чтобы команды обрабатывались первыми
    bot.on('text', async (ctx, next) => {
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

        // Обработка динамических кнопок меню
        const menuButtons = await menuButtonService.getAll(true);
        const clickedButton = menuButtons.find(btn => btn.name === ctx.message.text);

        if (clickedButton) {
            await userService.saveOrUpdate(ctx.from.id, {
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name
            });
            await ctx.reply(clickedButton.message, { parse_mode: 'HTML' });
            return;
        }
    });
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

        const text = `
💳 <b>Пополнение баланса</b>

Выберите способ пополнения:
        `.trim();

        const keyboard = [];
        for (const method of paymentMethods) {
            keyboard.push([{
                text: `${method.name} (${method.network})`,
                callback_data: `topup_method_${method.id}`
            }]);
        }
        keyboard.push([{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]);

        // Если пришло из callback, пытаемся отредактировать, иначе отправляем новое сообщение
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
async function showTopupMethod(ctx, methodId) {
    try {
        const method = await paymentService.getMethodById(methodId);
        if (!method) {
            await ctx.reply('Метод оплаты не найден.');
            return;
        }

        let text = '';
        let replyMarkup = {
            inline_keyboard: [
                [{ text: '◀️ Назад', callback_data: 'topup_balance' }]
            ]
        };

        if (method.type === 'card') {
            const cardAccount = await cardAccountService.getRandom();
            if (!cardAccount) {
                await ctx.reply('Карточные счета не настроены. Обратитесь к администратору.');
                return;
            }
            text = `💳 <b>Пополнение картой</b>\n\n` +
                `Способ: ${method.name}\n` +
                `Реквизиты:\n<b>${cardAccount.name}</b>\n<code>${cardAccount.account_number}</code>`;
        } else {
            const address = await paymentService.getAddressForMethod(methodId);
            if (!address) {
                await ctx.reply('Адрес для пополнения не найден. Обратитесь к администратору.');
                return;
            }
            text = `💳 <b>Пополнение через ${method.name}</b>\n\n` +
                `Сеть: ${method.network}\n` +
                `Адрес для пополнения:\n<code>${address.address}</code>`;
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
            const text = `
📦 <b>Мои заказы</b>

У вас пока нет заказов.
            `.trim();

            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                    ]
                }
            });
            return;
        }

        let text = `<b>📦 Мои заказы</b>\n\n`;
        for (let i = 0; i < Math.min(orders.length, 10); i++) {
            const order = orders[i];
            const status = order.status === 'completed' ? '✅' : order.status === 'pending' ? '⏳' : '❌';
            text += `${status} Заказ #${order.id}\n`;
            text += `💰 ${order.total_price} ₽\n`;
            text += `📅 ${new Date(order.created_at).toLocaleDateString('ru-RU')}\n\n`;
        }

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                ]
            }
        });
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в showMyOrders:', error);
        await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
    }
}

async function showTopupHistory(ctx) {
    try {
        const topups = await getTopupsByUser(ctx.from.id);

        if (topups.length === 0) {
            const text = `
💵 <b>История пополнений</b>

У вас пока нет пополнений.
            `.trim();

            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                    ]
                }
            });
            return;
        }

        let text = `<b>💵 История пополнений</b>\n\n`;
        for (let i = 0; i < Math.min(topups.length, 10); i++) {
            const topup = topups[i];
            const status = topup.status === 'completed' ? '✅' : topup.status === 'pending' ? '⏳' : '❌';
            text += `${status} ${topup.amount} ₽\n`;
            text += `📅 ${new Date(topup.created_at).toLocaleDateString('ru-RU')}\n\n`;
        }

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                ]
            }
        });
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в showTopupHistory:', error);
        await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
    }
}

async function showReferrals(ctx) {
    try {
        const referrals = await referralService.getReferralsByReferrer(ctx.from.id);
        const referralCount = referrals.length;
        const discountPercent = await settingsService.getReferralDiscountPercent();
        const maxDiscount = await settingsService.getMaxReferralDiscountPercent();
        const cashbackPercent = await settingsService.getReferralCashbackPercent();

        // Рассчитываем текущую скидку
        const currentDiscount = Math.min(referralCount * discountPercent, maxDiscount);

        let text = `👥 <b>Мои рефералы</b>\n\n`;
        text += `📊 Количество рефералов: <b>${referralCount}</b>\n\n`;

        if (referrals.length > 0) {
            text += `<b>Список рефералов:</b>\n`;
            referrals.slice(0, 10).forEach((ref, index) => {
                const username = ref.username ? `@${ref.username}` : 'Без username';
                const name = ref.first_name || 'Неизвестно';
                text += `${index + 1}. ${name} (${username})\n`;
            });
            if (referrals.length > 10) {
                text += `\n... и еще ${referrals.length - 10} рефералов\n`;
            }
        } else {
            text += `У вас пока нет рефералов.\n`;
        }

        text += `\n💰 <b>Ваша текущая скидка: ${currentDiscount.toFixed(1)}%</b>\n`;
        text += `\n📝 <b>Как работает система:</b>\n`;
        text += `• За каждого приглашенного пользователя вы получаете скидку <b>${discountPercent}%</b>\n`;
        text += `• Максимальная скидка: <b>${maxDiscount}%</b>\n`;
        text += `• Если приглашенный пользователь совершит покупку, вам вернется <b>${cashbackPercent}%</b> от суммы покупки кешбеком на баланс\n`;

        const keyboard = [
            [{ text: '🔗 Сгенерировать ссылку для друга', callback_data: 'generate_referral_link' }],
            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
        ];

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в showReferrals:', error);
        await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
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
        return await database.all(
            'SELECT * FROM topups WHERE user_chat_id = ? ORDER BY created_at DESC LIMIT 20',
            [chatId]
        );
    } catch (error) {
        console.error('[UserHandlers] Ошибка при получении истории пополнений:', error);
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
    keyboard.push([{ text: '💬 Помощь', callback_data: 'help_support' }]);

    await ctx.reply(
        '🏙️ Выберите город:',
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
                        [{ text: '◀️ Назад к городам', callback_data: 'back_to_cities' }]
                    ]
                }
            }
        );
        return;
    }

    const keyboard = districts.map(district => [
        { text: `📍 ${district.name}`, callback_data: `district_${district.id}` }
    ]);

    keyboard.push([{ text: '◀️ Назад к городам', callback_data: 'back_to_cities' }]);

    try {
        await ctx.editMessageText(
            `🏙️ Город: ${city.name}\n\n📍 Выберите район:`,
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

    keyboard.push([{ text: '◀️ Назад к районам', callback_data: `back_to_districts_${city.id}` }]);

    try {
        await ctx.editMessageText(
            `🛍️ Товары в районе ${district.name} (${city.name}):\n\nВыберите товар:`,
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    } catch (error) {
        await ctx.reply(
            `🛍️ Товары в районе ${district.name} (${city.name}):\n\nВыберите товар:`,
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

        const text = `<b>Создан заказ #12${order.id}</b>

<b>Витрина:</b> Hitpoint 
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
💳 <b>Оплата заказа #${order.id}</b>

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

