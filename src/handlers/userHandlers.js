import { cityService } from '../services/cityService.js';
import { productService } from '../services/productService.js';
import { paymentService } from '../services/paymentService.js';
import { cardAccountService } from '../services/cardAccountService.js';
import { userService } from '../services/userService.js';
import { supportService } from '../services/supportService.js';
import { settingsService } from '../services/settingsService.js';
import { menuButtonService } from '../services/menuButtonService.js';
import { promocodeService } from '../services/promocodeService.js';
import { statisticsService } from '../services/statisticsService.js';

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

    // Обработка выбора города
    bot.action(/^city_(\d+)$/, async (ctx) => {
        await userService.saveOrUpdate(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
        });
        const cityId = parseInt(ctx.match[1]);
        await showProductsMenu(ctx, cityId);
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

    // Обработка использования промокода
    bot.action(/^use_promocode_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        await showPromocodeInput(ctx, productId);
    });

    // Обработка применения промокода
    bot.action(/^apply_promocode_(\d+)_(.+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const promocode = ctx.match[2];
        await applyPromocode(ctx, productId, promocode);
    });

    // Обработка выбора метода оплаты
    bot.action(/^pay_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const methodId = parseInt(ctx.match[2]);
        await showPaymentAddress(ctx, productId, methodId);
    });

    // Обработка выбора метода пополнения баланса в личном кабинете
    bot.action(/^topup_method_(\d+)$/, async (ctx) => {
        const methodId = parseInt(ctx.match[1]);
        await showTopupMethod(ctx, methodId);
    });

    // Обработка выбора метода оплаты с промокодом
    bot.action(/^pay_with_promo_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const methodId = parseInt(ctx.match[2]);
        const promocodeId = parseInt(ctx.match[3]);
        await showPaymentAddress(ctx, productId, methodId, promocodeId);
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

    // Вернуться к товарам
    bot.action(/^back_to_products_(\d+)$/, async (ctx) => {
        const cityId = parseInt(ctx.match[1]);
        try {
            await showProductsMenu(ctx, cityId);
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
            await applyPromocode(ctx, productId, promocodeText);
            promocodeInputMode.delete(ctx.from.id);
            return;
        }

        // Обработка ввода промокода
        if (promocodeInputMode.has(ctx.from.id)) {
            const productId = promocodeInputMode.get(ctx.from.id);
            const promocodeText = ctx.message.text.trim().toUpperCase();
            await applyPromocode(ctx, productId, promocodeText);
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

        const text = `👤 <b>Личный кабинет</b>

🆔 ID: <code>${ctx.from.id}</code>
👤 Имя: ${ctx.from.first_name || 'Не указано'} ${ctx.from.last_name || ''}
📱 Username: ${ctx.from.username ? '@' + ctx.from.username : 'Не указано'}
📅 Дата регистрации: ${user?.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : 'Неизвестно'}
🕐 Последняя активность: ${user?.last_active ? new Date(user.last_active).toLocaleDateString('ru-RU') + ' ' + new Date(user.last_active).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Неизвестно'}

💰 <b>Баланс: ${balance.toFixed(2)} ₽</b>`;

        const keyboard = [
            [{ text: '💳 Пополнить', callback_data: 'topup_balance' }],
            [{ text: '📦 Мои заказы', callback_data: 'my_orders' }],
            [{ text: '💵 История пополнений', callback_data: 'topup_history' }],
            [{ text: '🏠 Главное меню', callback_data: 'back_to_cities' }]
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

async function showProductsMenu(ctx, cityId) {
    const city = await cityService.getById(cityId);
    if (!city) {
        await ctx.reply('Город не найден.');
        return;
    }

    const products = await productService.getByCityId(cityId);

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

    keyboard.push([{ text: '◀️ Назад к городам', callback_data: 'back_to_cities' }]);

    await ctx.editMessageText(
        `🛍️ Товары в городе ${city.name}:\n\nВыберите товар:`,
        {
            reply_markup: {
                inline_keyboard: keyboard
            }
        }
    );
}

async function showProductDetails(ctx, productId) {
    const product = await productService.getById(productId);
    if (!product) {
        await ctx.reply('Товар не найден.');
        return;
    }

    const city = await cityService.getById(product.city_id);
    const paymentMethods = await paymentService.getAllMethods();

    const packagingLine = product.packaging_value
        ? `\n⚖️ Фасовка: <b>${product.packaging_value} кг</b>\n`
        : '\n';

    if (paymentMethods.length === 0) {
        await ctx.editMessageText(
            `📦 <b>${product.name}</b>\n\n${product.description || 'Описание отсутствует'}\n\n💰 Цена: <b>${product.price.toLocaleString('ru-RU')} ₽</b>\n📍 Город: ${city.name}${packagingLine}\n❌ Методы оплаты пока не настроены. Обратитесь к администратору.`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад к товарам', callback_data: `back_to_products_${city.id}` }]
                    ]
                }
            }
        );
        return;
    }

    const text = `
📦 <b>${product.name}</b>

${product.description || 'Описание отсутствует'}

💰 Цена: <b>${product.price.toLocaleString('ru-RU')} ₽</b>
📍 Город: ${city.name}${packagingLine}
Выберите способ оплаты:
  `.trim();

    const keyboard = paymentMethods.map(method => [
        { text: `💳 ${method.name}`, callback_data: `pay_${product.id}_${method.id}` }
    ]);

    // Добавляем кнопку "Использовать промокод"
    keyboard.push([{ text: '🎁 Использовать промокод', callback_data: `use_promocode_${product.id}` }]);
    keyboard.push([{ text: '◀️ Назад к товарам', callback_data: `back_to_products_${city.id}` }]);

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: keyboard
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

    // Рассчитываем цену с учетом промокода
    let finalPrice = product.price;
    let discountText = '';

    if (promocodeId) {
        const promocode = await promocodeService.getById(promocodeId);
        if (promocode) {
            const discount = (product.price * promocode.discount_percent) / 100;
            finalPrice = product.price - discount;
            discountText = `\n🎁 Промокод <b>${promocode.code}</b>: -${promocode.discount_percent}%\n💰 Скидка: <b>${discount.toLocaleString('ru-RU')} ₽</b>\n`;
        }
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

// Функция для показа интерфейса ввода промокода
async function showPromocodeInput(ctx, productId) {
    const product = await productService.getById(productId);
    if (!product) {
        await ctx.reply('Товар не найден.');
        return;
    }

    promocodeInputMode.set(ctx.from.id, productId);

    const inputText = `🎁 <b>Использование промокода</b>\n\n` +
        `📦 Товар: <b>${product.name}</b>\n` +
        `💰 Цена: <b>${product.price.toLocaleString('ru-RU')} ₽</b>\n\n` +
        `Введите код промокода:`;

    const inputKeyboard = {
        inline_keyboard: [
            [{ text: '◀️ Назад к товару', callback_data: `back_to_product_${productId}` }]
        ]
    };

    // Если это callback query, редактируем сообщение, иначе отправляем новое
    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(inputText, {
                parse_mode: 'HTML',
                reply_markup: inputKeyboard
            });
        } catch (error) {
            // Если не удалось отредактировать, отправляем новое сообщение
            await ctx.reply(inputText, {
                parse_mode: 'HTML',
                reply_markup: inputKeyboard
            });
        }
    } else {
        await ctx.reply(inputText, {
            parse_mode: 'HTML',
            reply_markup: inputKeyboard
        });
    }
}

// Функция для применения промокода
async function applyPromocode(ctx, productId, promocodeText) {
    const product = await productService.getById(productId);
    if (!product) {
        await ctx.reply('Товар не найден.');
        return;
    }

    // Валидация промокода
    const validation = await promocodeService.validatePromocodeForUser(ctx.from.id, promocodeText);

    if (!validation.valid) {
        await ctx.reply(`❌ ${validation.reason}`);
        await showProductDetails(ctx, productId);
        return;
    }

    const promocode = validation.promocode;
    const discount = (product.price * promocode.discount_percent) / 100;
    const finalPrice = product.price - discount;

    const city = await cityService.getById(product.city_id);
    const paymentMethods = await paymentService.getAllMethods();

    const packagingLine = product.packaging_value
        ? `\n⚖️ Фасовка: <b>${product.packaging_value} кг</b>\n`
        : '\n';

    const text = `
📦 <b>${product.name}</b>

${product.description || 'Описание отсутствует'}

💰 Цена: <b>${product.price.toLocaleString('ru-RU')} ₽</b>
🎁 Промокод <b>${promocode.code}</b>: -${promocode.discount_percent}%
💰 Скидка: <b>${discount.toLocaleString('ru-RU')} ₽</b>
💰 Итого: <b>${finalPrice.toLocaleString('ru-RU')} ₽</b>
📍 Город: ${city.name}${packagingLine}
Выберите способ оплаты:
  `.trim();

    const keyboard = paymentMethods.map(method => [
        { text: `💳 ${method.name}`, callback_data: `pay_with_promo_${product.id}_${method.id}_${promocode.id}` }
    ]);

    keyboard.push([{ text: '◀️ Назад к товарам', callback_data: `back_to_products_${city.id}` }]);

    // Если это callback query, редактируем сообщение, иначе отправляем новое
    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } catch (error) {
            // Если не удалось отредактировать, отправляем новое сообщение
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    } else {
        // Если это текстовое сообщение, отправляем новое
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    }
}
