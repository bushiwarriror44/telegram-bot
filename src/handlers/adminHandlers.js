import { config } from '../config/index.js';
import { cityService } from '../services/cityService.js';
import { productService } from '../services/productService.js';
import { paymentService } from '../services/paymentService.js';
import { packagingService } from '../services/packagingService.js';
import { userService } from '../services/userService.js';
import { cardAccountService } from '../services/cardAccountService.js';
import { supportService } from '../services/supportService.js';

const adminSessions = new Map(); // Хранит активные сессии админов
const notificationSessions = new Map(); // Хранит сессии создания уведомлений (userId -> true)
const importPaymentMode = new Map(); // userId -> true (режим загрузки платежных данных)
const importProductMode = new Map(); // userId -> true (режим загрузки товаров)

// Шаблоны товаров по умолчанию
const PRODUCT_TEMPLATES = [
    { id: 1, name: 'Яблоки' },
    { id: 2, name: 'Груши' },
    { id: 3, name: 'Персики' }
];

export function setupAdminHandlers(bot) {
    console.log('[AdminHandlers] Настройка админ-обработчиков...');
    console.log('[AdminHandlers] Регистрация команды /apanel...');

    // Команда для входа в админ-панель
    bot.command('apanel', async (ctx) => {
        console.log('[AdminHandlers] ========== ОБРАБОТЧИК /apanel ВЫЗВАН ==========');
        console.log('[AdminHandlers] ========== Команда /apanel получена ==========');
        console.log('[AdminHandlers] Пользователь ID:', ctx.from.id);
        console.log('[AdminHandlers] Текст команды:', ctx.message.text);

        try {
            const args = ctx.message.text.split(' ');
            const password = args[1];
            console.log('[AdminHandlers] Пароль получен:', password ? 'да' : 'нет');

            if (!password) {
                await ctx.reply('❌ Укажите пароль: /apanel пароль');
                return;
            }

            if (password === config.adminPassword) {
                console.log('[AdminHandlers] Пароль верный, вход в админ-панель');
                adminSessions.set(ctx.from.id, true);

                // Приветственное сообщение
                console.log('[AdminHandlers] Отправка приветственного сообщения...');
                await ctx.reply('✅ Вы вошли в администраторскую панель!', {
                    parse_mode: 'HTML'
                });
                console.log('[AdminHandlers] Приветственное сообщение отправлено');

                // Настройка админского меню команд для этого пользователя
                console.log('[AdminHandlers] Настройка админского меню команд...');
                try {
                    const adminCommands = [
                        { command: 'apanel', description: 'Админ-панель' },
                        { command: 'sendnotification', description: 'Создать уведомление' },
                        { command: 'addcity', description: 'Добавить город' },
                        { command: 'addproduct', description: 'Добавить товар' },
                        { command: 'addpayment', description: 'Добавить метод оплаты' },
                        { command: 'setaddress', description: 'Установить адрес оплаты' },
                        { command: 'addcard', description: 'Добавить карточный счет' },
                        { command: 'addpack', description: 'Добавить фасовку' }
                    ];

                    // Пробуем установить команды для конкретного пользователя
                    // Используем асинхронный вызов без await, чтобы не блокировать выполнение
                    bot.telegram.setMyCommands(adminCommands, {
                        scope: {
                            type: 'chat',
                            chat_id: ctx.from.id
                        }
                    }).then(() => {
                        console.log('[AdminHandlers] Админское меню команд установлено для пользователя:', ctx.from.id);
                    }).catch((error) => {
                        console.error('[AdminHandlers] Ошибка при установке админского меню команд:', error);
                        console.error('[AdminHandlers] Детали ошибки:', error.message);
                        // Пробуем установить глобально как fallback
                        bot.telegram.setMyCommands(adminCommands).catch(err => {
                            console.error('[AdminHandlers] Ошибка при установке команд глобально:', err);
                        });
                    });
                } catch (error) {
                    console.error('[AdminHandlers] Критическая ошибка при настройке меню команд:', error);
                    // Продолжаем выполнение даже если меню не установилось
                }

                // Показываем админ-панель
                console.log('[AdminHandlers] Показ админ-панели...');
                await showAdminPanel(ctx);
                console.log('[AdminHandlers] Админ-панель показана');
            } else {
                console.log('[AdminHandlers] Неверный пароль');
                await ctx.reply('❌ Неверный пароль доступа к админ-панели.');
            }
        } catch (error) {
            console.error('[AdminHandlers] ========== КРИТИЧЕСКАЯ ОШИБКА в /apanel ==========');
            console.error('[AdminHandlers] Ошибка:', error);
            console.error('[AdminHandlers] Сообщение:', error.message);
            console.error('[AdminHandlers] Stack:', error.stack);
            try {
                await ctx.reply('❌ Произошла ошибка при входе в админ-панель. Попробуйте позже.');
            } catch (e) {
                console.error('[AdminHandlers] Не удалось отправить сообщение об ошибке:', e);
            }
        }
    });

    // Проверка прав администратора
    function isAdmin(userId) {
        return adminSessions.has(userId);
    }

    // Главное меню админ-панели
    async function showAdminPanel(ctx) {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа к админ-панели.');
            return;
        }

        // Получаем все криптовалютные адреса
        const cryptoMethods = await paymentService.getCryptoMethods();
        const cryptoAddresses = [];
        for (const method of cryptoMethods) {
            const address = await paymentService.getAddressForMethod(method.id);
            if (address) {
                cryptoAddresses.push(`${method.name} (${method.network}): <code>${address.address}</code>`);
            }
        }

        // Получаем все карточные счета
        const cardAccounts = await cardAccountService.getAll(true);
        const cardAccountsList = cardAccounts.map(card =>
            `${card.name}: <code>${card.account_number}</code>`
        );

        let addressesText = '';
        if (cryptoAddresses.length > 0) {
            addressesText += '\n\n<b>💎 Криптовалютные адреса:</b>\n' + cryptoAddresses.join('\n');
        }
        if (cardAccountsList.length > 0) {
            addressesText += '\n\n<b>💳 Карточные счета:</b>\n' + cardAccountsList.join('\n');
        }
        if (cryptoAddresses.length === 0 && cardAccountsList.length === 0) {
            addressesText = '\n\n⚠️ Адреса еще не настроены';
        }

        const text = `
🔐 <b>Админ-панель</b>
${addressesText}

Выберите раздел для управления:
        `.trim();

        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏙️ Управление городами', callback_data: 'admin_cities' }],
                    [{ text: '📦 Управление товарами', callback_data: 'admin_products' }],
                    [{ text: '⚖️ Управление фасовками', callback_data: 'admin_packagings' }],
                    [{ text: '💳 Управление методами оплаты', callback_data: 'admin_payments' }],
                    [{ text: '💳 Управление карточными счетами', callback_data: 'admin_cards' }],
                    [{ text: '💬 Чаты', callback_data: 'admin_chats' }],
                    [{ text: '📢 Создать уведомление', callback_data: 'admin_notification' }],
                    [{ text: '💾 Данные', callback_data: 'admin_data' }],
                    [{ text: '🚪 Выход из админ-панели', callback_data: 'admin_logout' }]
                ]
            }
        });
    }

    // Обработчики админ-панели
    bot.action('admin_panel', async (ctx) => {
        await showAdminPanel(ctx);
    });

    bot.action('admin_cities', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCitiesAdmin(ctx);
    });

    bot.action('admin_products', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showProductsAdmin(ctx);
    });

    bot.action('admin_payments', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPaymentsAdmin(ctx);
    });

    bot.action('admin_packagings', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPackagingsAdmin(ctx);
    });

    bot.action('admin_chats', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showChatsMenu(ctx);
    });

    bot.action('admin_data', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showDataMenu(ctx);
    });

    bot.action('admin_logout', async (ctx) => {
        adminSessions.delete(ctx.from.id);
        notificationSessions.delete(ctx.from.id);

        // Возвращаем обычное пользовательское меню команд
        try {
            const userCommands = [
                { command: 'start', description: 'Главное меню' },
                { command: 'catalog', description: 'Каталог товаров' },
                { command: 'cabinet', description: 'Личный кабинет' }
            ];

            // Устанавливаем пользовательские команды для этого пользователя
            await bot.telegram.setMyCommands(userCommands, {
                scope: {
                    type: 'chat',
                    chat_id: ctx.from.id
                }
            });
            console.log('[AdminHandlers] Пользовательское меню команд восстановлено для пользователя:', ctx.from.id);
        } catch (error) {
            console.error('[AdminHandlers] Ошибка при восстановлении пользовательского меню команд:', error);
            console.error('[AdminHandlers] Детали ошибки:', error.message);
            // Если scope не поддерживается, это не критично
        }

        await ctx.editMessageText('✅ Вы вышли из админ-панели. Пользовательское меню восстановлено.');
    });

    // Управление уведомлениями
    bot.action('admin_notification', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showNotificationMenu(ctx);
    });

    async function showNotificationMenu(ctx) {
        const userCount = await userService.getUserCount();

        const text = `
📢 <b>Создание уведомления</b>

Всего пользователей в базе: <b>${userCount}</b>

Введите текст уведомления командой:
<code>/sendnotification Текст уведомления</code>

Или нажмите кнопку ниже для отмены.
        `.trim();

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Отмена', callback_data: 'admin_panel' }]
                ]
            }
        });
    }

    bot.command('sendnotification', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ');
        const notificationText = args.slice(1).join(' ');

        if (!notificationText || notificationText.trim().length === 0) {
            await ctx.reply('❌ Укажите текст уведомления.\nФормат: /sendnotification Текст уведомления');
            return;
        }

        await sendNotificationToAll(bot, ctx, notificationText.trim());
    });

    // Функция рассылки уведомлений всем пользователям
    async function sendNotificationToAll(bot, ctx, text) {
        const users = await userService.getAllUsers();
        const totalUsers = users.length;

        if (totalUsers === 0) {
            await ctx.reply('❌ В базе нет пользователей для рассылки.');
            return;
        }

        await ctx.reply(`📤 Начинаю рассылку уведомления ${totalUsers} пользователям...`);

        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
            try {
                await bot.telegram.sendMessage(user.chat_id, `📢 <b>Уведомление от администратора</b>\n\n${text}`, {
                    parse_mode: 'HTML'
                });
                successCount++;
            } catch (error) {
                failCount++;
                console.error(`Ошибка отправки уведомления пользователю ${user.chat_id}:`, error.message);
            }
        }

        await ctx.reply(
            `✅ Рассылка завершена!\n\n` +
            `✅ Успешно отправлено: ${successCount}\n` +
            `❌ Ошибок: ${failCount}\n` +
            `📊 Всего пользователей: ${totalUsers}`
        );
    }

    // Управление карточными счетами
    bot.action('admin_cards', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCardsAdmin(ctx);
    });

    async function showCardsAdmin(ctx) {
        const cards = await cardAccountService.getAll(false);

        const text = `
💳 <b>Управление карточными счетами</b>

Текущие карточные счета:
${cards.map(card => `• ${card.name}: <code>${card.account_number}</code> ${card.enabled ? '✅' : '❌'}`).join('\n') || 'Карточных счетов пока нет'}

При оплате картой пользователям будет случайно показываться один из активных счетов.
        `.trim();

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Добавить карточный счет', callback_data: 'admin_card_add' }],
                    [{ text: '🗑️ Удалить карточный счет', callback_data: 'admin_card_delete' }],
                    [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
                ]
            }
        });
    }

    bot.action('admin_card_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            'Введите данные нового карточного счета:\n\nФормат: <code>/addcard Название|Номер счета</code>\n\nПример: /addcard Альфа-Банк|5536 9141 2345 6789',
            { parse_mode: 'HTML' }
        );
    });

    bot.command('addcard', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1).join(' ').split('|');

        if (args.length < 2) {
            await ctx.reply('❌ Неверный формат.\nФормат: /addcard Название|Номер счета');
            return;
        }

        const [name, accountNumber] = args;

        try {
            await cardAccountService.create(name.trim(), accountNumber.trim());
            await ctx.reply(`✅ Карточный счет "${name}" успешно добавлен!`);
            await showCardsAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_card_delete', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cards = await cardAccountService.getAll(false);

        if (cards.length === 0) {
            await ctx.editMessageText('Нет карточных счетов для удаления.');
            return;
        }

        const keyboard = cards.map(card => [
            { text: `🗑️ ${card.name}`, callback_data: `admin_card_del_${card.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_cards' }]);

        await ctx.editMessageText('Выберите карточный счет для удаления:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_card_del_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cardId = parseInt(ctx.match[1]);

        try {
            await cardAccountService.delete(cardId);
            await ctx.editMessageText('✅ Карточный счет успешно удален!');
            await showCardsAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    // Управление городами
    async function showCitiesAdmin(ctx) {
        const cities = await cityService.getAll();

        const text = `
🏙️ <b>Управление городами</b>

Список городов:
${cities.map(c => `• ${c.name}`).join('\n') || 'Городов пока нет'}
    `.trim();

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Добавить город', callback_data: 'admin_city_add' }],
                    [{ text: '🗑️ Удалить город', callback_data: 'admin_city_delete' }],
                    [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
                ]
            }
        });
    }

    bot.action('admin_city_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            'Введите название нового города:\n\nФормат: <code>/addcity Название города</code>',
            { parse_mode: 'HTML' }
        );
    });

    bot.command('addcity', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1);
        const cityName = args.join(' ');

        if (!cityName) {
            await ctx.reply('❌ Укажите название города.\nФормат: /addcity Название города');
            return;
        }

        try {
            await cityService.create(cityName);
            await ctx.reply(`✅ Город "${cityName}" успешно добавлен!`);
            await showCitiesAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_city_delete', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cities = await cityService.getAll();

        if (cities.length === 0) {
            await ctx.editMessageText('Нет городов для удаления.');
            return;
        }

        const keyboard = cities.map(city => [
            { text: `🗑️ ${city.name}`, callback_data: `admin_city_del_${city.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_cities' }]);

        await ctx.editMessageText('Выберите город для удаления:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_city_del_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);

        try {
            await cityService.delete(cityId);
            await ctx.editMessageText('✅ Город успешно удален!');
            await showCitiesAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    // Управление товарами
    async function showProductsAdmin(ctx) {
        const cities = await cityService.getAll();

        const text = `
📦 <b>Управление товарами</b>

Выберите город для управления товарами:
    `.trim();

        const keyboard = cities.map(city => [
            { text: `📍 ${city.name}`, callback_data: `admin_products_city_${city.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_panel' }]);

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    bot.action(/^admin_products_city_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        await showCityProductsAdmin(ctx, cityId);
    });

    async function showCityProductsAdmin(ctx, cityId) {
        const city = await cityService.getById(cityId);
        const products = await productService.getByCityId(cityId);

        const text = `
📦 <b>Товары в городе: ${city.name}</b>

${products.map(p => {
            const packagingLabel = p.packaging_value ? ` (${p.packaging_value} кг)` : '';
            return `• ${p.name}${packagingLabel} - ${p.price} ₽`;
        }).join('\n') || 'Товаров пока нет'}
    `.trim();

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Добавить товар', callback_data: `admin_product_add_${cityId}` }],
                    [{ text: '🗑️ Удалить товар', callback_data: `admin_product_delete_${cityId}` }],
                    [{ text: '◀️ Назад', callback_data: 'admin_products' }]
                ]
            }
        });
    }

    bot.action(/^admin_product_add_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        await ctx.editMessageText(
            `Введите данные нового товара.\n\nДоступные шаблоны названий:\n` +
            PRODUCT_TEMPLATES.map(t => `${t.id}) ${t.name}`).join('\n') +
            `\n\nВы можете указать либо название товара, либо ID шаблона.\n` +
            `Также обязательно укажите фасовку (например: 0.25, 0.5, 1, 2 и т.д.).\n\n` +
            `Формат: <code>/addproduct ${cityId} НазваниеИЛИ_ID|Описание|Цена|Фасовка</code>\n\n` +
            `Пример c шаблоном: /addproduct ${cityId} 1|Сладкие красные яблоки|500|1\n` +
            `Пример с произвольным названием: /addproduct ${cityId} Манго|Спелое манго|900|0.5`,
            { parse_mode: 'HTML' }
        );
    });

    bot.command('addproduct', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1);
        const cityId = parseInt(args[0]);
        const data = args.slice(1).join(' ').split('|');

        if (isNaN(cityId)) {
            await ctx.reply('❌ Неверный формат cityId.\nФормат: /addproduct cityId НазваниеИЛИ_ID|Описание|Цена|Фасовка');
            return;
        }

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
            // Фасовка должна существовать (админ может добавить её через /addpack)
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
                name,
                description.trim(),
                priceNum,
                packaging.id
            );
            await ctx.reply(`✅ Товар "${name}" успешно добавлен!`);
            await showCityProductsAdmin(ctx, cityId);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action(/^admin_product_delete_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        const products = await productService.getByCityId(cityId);

        if (products.length === 0) {
            await ctx.editMessageText('Нет товаров для удаления.');
            return;
        }

        const keyboard = products.map(product => [
            { text: `🗑️ ${product.name}`, callback_data: `admin_product_del_${product.id}_${cityId}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: `admin_products_city_${cityId}` }]);

        await ctx.editMessageText('Выберите товар для удаления:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_product_del_(\d+)_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const productId = parseInt(ctx.match[1]);
        const cityId = parseInt(ctx.match[2]);

        try {
            await productService.delete(productId);
            await ctx.editMessageText('✅ Товар успешно удален!');
            await showCityProductsAdmin(ctx, cityId);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    // Управление методами оплаты
    async function showPaymentsAdmin(ctx) {
        const methods = await paymentService.getAllMethods(true);

        const text = `
💳 <b>Управление методами оплаты</b>

Доступные методы:
${methods.map(m => `• ${m.name} (${m.network})`).join('\n') || 'Методов оплаты пока нет'}
    `.trim();

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Добавить метод оплаты', callback_data: 'admin_payment_add' }],
                    [{ text: '🔐 Изменить реквизиты', callback_data: 'admin_payment_address' }],
                    [{ text: '🗑️ Удалить метод оплаты', callback_data: 'admin_payment_delete' }],
                    [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
                ]
            }
        });
    }

    bot.action('admin_payment_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            'Введите данные нового метода оплаты:\n\n' +
            'Для криптовалюты:\n' +
            'Формат: <code>/addpayment Название|Сеть</code>\n' +
            'Пример: /addpayment Bitcoin|BTC\n\n' +
            'Для карты:\n' +
            'Формат: <code>/addpayment Название|CARD|card</code>\n' +
            'Пример: /addpayment Карта|CARD|card',
            { parse_mode: 'HTML' }
        );
    });

    bot.command('addpayment', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1).join(' ').split('|');

        if (args.length < 2) {
            await ctx.reply('❌ Неверный формат.\nФормат: /addpayment Название|Сеть\nДля карты: /addpayment Название|CARD|card');
            return;
        }

        const [name, network, type] = args;
        const paymentType = type ? type.trim().toLowerCase() : 'crypto';
        const networkUpper = network.trim().toUpperCase();

        // Если это карта, проверяем что network = CARD
        if (paymentType === 'card' && networkUpper !== 'CARD') {
            await ctx.reply('❌ Для карточного метода оплаты укажите сеть как CARD');
            return;
        }

        try {
            await paymentService.createMethod(name.trim(), networkUpper, paymentType);
            await ctx.reply(`✅ Метод оплаты "${name}" успешно добавлен!`);
            await showPaymentsAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_payment_address', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const methods = await paymentService.getAllMethods();

        if (methods.length === 0) {
            await ctx.editMessageText('Нет методов оплаты.');
            return;
        }

        const keyboard = methods.map(method => [
            { text: `${method.name}`, callback_data: `admin_payment_addr_${method.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_payments' }]);

        await ctx.editMessageText('Выберите метод оплаты для изменения реквизитов:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_payment_addr_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const methodId = parseInt(ctx.match[1]);
        await ctx.editMessageText(
            `Введите новый адрес для оплаты:\n\nФормат: <code>/setaddress ${methodId} Адрес</code>`,
            { parse_mode: 'HTML' }
        );
    });

    bot.command('setaddress', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1);
        const methodId = parseInt(args[0]);
        const address = args.slice(1).join(' ');

        if (!address) {
            await ctx.reply('❌ Укажите адрес.\nФормат: /setaddress methodId Адрес');
            return;
        }

        try {
            await paymentService.updateMethodAddress(methodId, address);
            await ctx.reply(`✅ Адрес для метода оплаты успешно обновлен!`);
            await showPaymentsAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_payment_delete', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const methods = await paymentService.getAllMethods(true);

        if (methods.length === 0) {
            await ctx.editMessageText('Нет методов оплаты для удаления.');
            return;
        }

        const keyboard = methods.map(method => [
            { text: `🗑️ ${method.name}`, callback_data: `admin_payment_del_${method.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_payments' }]);

        await ctx.editMessageText('Выберите метод оплаты для удаления:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_payment_del_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const methodId = parseInt(ctx.match[1]);

        try {
            await paymentService.deleteMethod(methodId);
            await ctx.editMessageText('✅ Метод оплаты успешно удален!');
            await showPaymentsAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    // Управление фасовками
    async function showPackagingsAdmin(ctx) {
        const packagings = await packagingService.getAll();

        const text = `
⚖️ <b>Управление фасовками</b>

Текущие фасовки:
${packagings.map((p) => `• ${p.value} кг (id: ${p.id})`).join('\n') || 'Фасовок пока нет'}
    `.trim();

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Добавить фасовку', callback_data: 'admin_packaging_add' }],
                    [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
                ]
            }
        });
    }

    bot.action('admin_packaging_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.editMessageText(
            'Введите новую фасовку:\n\nФормат: <code>/addpack Значение</code>\n\nПример: /addpack 0.75',
            { parse_mode: 'HTML' }
        );
    });

    bot.command('addpack', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        const args = ctx.message.text.split(' ').slice(1);
        const valueStr = args[0];

        if (!valueStr) {
            await ctx.reply('❌ Укажите значение фасовки.\nПример: /addpack 0.35');
            return;
        }

        const value = parseFloat(valueStr.replace(',', '.'));
        if (isNaN(value) || value <= 0) {
            await ctx.reply('❌ Фасовка должна быть положительным числом.\nПример: /addpack 0.25');
            return;
        }

        try {
            const existing = await packagingService.getByValue(value);
            if (existing) {
                await ctx.reply('⚠️ Такая фасовка уже существует.');
                return;
            }

            await packagingService.create(value);
            await ctx.reply(`✅ Фасовка ${value} кг успешно добавлена!`);
            await showPackagingsAdmin(ctx);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    // Управление чатами поддержки
    async function showChatsMenu(ctx) {
        const text = `
💬 <b>Чаты поддержки</b>

Выберите действие:
        `.trim();

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📋 Последние', callback_data: 'admin_chats_recent' }],
                    [{ text: '📚 Все чаты', callback_data: 'admin_chats_all' }],
                    [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
                ]
            }
        });
    }

    bot.action('admin_chats_recent', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showChatsList(ctx, 10);
    });

    bot.action('admin_chats_all', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showChatsList(ctx);
    });

    async function showChatsList(ctx, limit = null) {
        const users = await supportService.getUsersWithMessages(limit);

        if (users.length === 0) {
            await ctx.editMessageText('Нет сообщений от пользователей.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Назад', callback_data: 'admin_chats' }]
                    ]
                }
            });
            return;
        }

        const text = `
💬 <b>${limit ? 'Последние чаты' : 'Все чаты'}</b>

Выберите пользователя для просмотра переписки:
        `.trim();

        const keyboard = users.map(user => {
            const userName = user.first_name || user.username || `ID: ${user.chat_id}`;
            const unreadBadge = user.unread_count > 0 ? ` (${user.unread_count})` : '';
            return [{ text: `👤 ${userName}${unreadBadge}`, callback_data: `admin_chat_${user.chat_id}` }];
        });
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_chats' }]);

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    bot.action(/^admin_chat_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const userChatId = parseInt(ctx.match[1]);
        await showConversation(ctx, userChatId);
    });

    async function showConversation(ctx, userChatId) {
        const user = await supportService.getUserInfo(userChatId);
        const messages = await supportService.getConversation(userChatId);

        if (!user) {
            await ctx.reply('Пользователь не найден.');
            return;
        }

        const userName = user.first_name || user.username || `ID: ${user.chat_id}`;
        let conversationText = `💬 <b>Переписка с ${userName}</b>\n\n`;

        if (messages.length === 0) {
            conversationText += 'Сообщений пока нет.';
        } else {
            for (const msg of messages) {
                const time = new Date(msg.created_at).toLocaleString('ru-RU');
                if (msg.is_from_admin) {
                    conversationText += `👨‍💼 <b>Администратор</b> (${time}):\n${msg.message_text}\n\n`;
                } else {
                    conversationText += `👤 <b>Пользователь</b> (${time}):\n${msg.message_text}\n\n`;
                }
            }
        }

        await ctx.editMessageText(conversationText, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Ответить', callback_data: `admin_reply_${userChatId}` }],
                    [{ text: '◀️ Назад к чатам', callback_data: 'admin_chats' }]
                ]
            }
        });
    }

    // Хранит пользователей, которым администратор отвечает
    const adminReplyMode = new Map();

    bot.action(/^admin_reply_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const userChatId = parseInt(ctx.match[1]);
        adminReplyMode.set(ctx.from.id, userChatId);
        await ctx.editMessageText(
            `Введите ответ пользователю:\n\nФормат: <code>/reply Текст ответа</code>\n\nИли просто отправьте текст сообщения.`,
            { parse_mode: 'HTML' }
        );
    });

    // Обработка ответов администратора и загрузки данных
    bot.on('text', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;

        // Пропускаем команды
        if (ctx.message.text.startsWith('/')) {
            if (ctx.message.text === '/cancel') {
                importPaymentMode.delete(ctx.from.id);
                importProductMode.delete(ctx.from.id);
                adminReplyMode.delete(ctx.from.id);
                await ctx.reply('❌ Операция отменена.');
                await showDataMenu(ctx);
            }
            return;
        }

        // Обработка загрузки платежных адресов
        if (importPaymentMode.has(ctx.from.id)) {
            try {
                const jsonText = ctx.message.text;
                const data = JSON.parse(jsonText);

                if (!Array.isArray(data)) {
                    await ctx.reply('❌ Ошибка: JSON должен быть массивом объектов.');
                    return;
                }

                // Удаляем все существующие методы оплаты
                const existingMethods = await paymentService.getAllMethods(true);
                for (const method of existingMethods) {
                    await paymentService.deleteMethod(method.id);
                }

                // Создаем новые методы оплаты
                for (const item of data) {
                    if (!item.name || !item.network) {
                        await ctx.reply(`❌ Ошибка: Пропущены обязательные поля (name, network) в элементе: ${JSON.stringify(item)}`);
                        continue;
                    }

                    const method = await paymentService.createMethod(
                        item.name,
                        item.network,
                        item.type || 'crypto'
                    );

                    if (item.enabled === false) {
                        await paymentService.enableMethod(method.id, false);
                    }

                    if (item.address) {
                        await paymentService.setAddressForMethod(method.id, item.address);
                    }
                }

                importPaymentMode.delete(ctx.from.id);
                await ctx.reply(`✅ Успешно загружено ${data.length} платежных методов!`);
                await showDataMenu(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при загрузке платежных данных:', error);
                await ctx.reply('❌ Ошибка при загрузке платежных данных: ' + error.message);
            }
            return;
        }

        // Обработка загрузки товаров
        if (importProductMode.has(ctx.from.id)) {
            try {
                const jsonText = ctx.message.text;
                const data = JSON.parse(jsonText);

                if (!Array.isArray(data)) {
                    await ctx.reply('❌ Ошибка: JSON должен быть массивом объектов.');
                    return;
                }

                // Удаляем все существующие товары
                const cities = await cityService.getAll();
                for (const city of cities) {
                    const products = await productService.getByCityId(city.id);
                    for (const product of products) {
                        await productService.delete(product.id);
                    }
                }

                // Создаем новые товары
                let createdCount = 0;
                for (const item of data) {
                    if (!item.city_name || !item.name || item.price === undefined) {
                        await ctx.reply(`❌ Ошибка: Пропущены обязательные поля (city_name, name, price) в элементе: ${JSON.stringify(item)}`);
                        continue;
                    }

                    // Находим или создаем город
                    const allCities = await cityService.getAll();
                    let city = allCities.find(c => c.name === item.city_name);
                    if (!city) {
                        city = await cityService.create(item.city_name);
                    }

                    // Находим или создаем фасовку, если указана
                    let packagingId = null;
                    if (item.packaging_value !== null && item.packaging_value !== undefined) {
                        let packaging = await packagingService.getByValue(item.packaging_value);
                        if (!packaging) {
                            packaging = await packagingService.create(item.packaging_value);
                        }
                        packagingId = packaging.id;
                    }

                    await productService.create(
                        city.id,
                        item.name,
                        item.description || '',
                        item.price,
                        packagingId
                    );
                    createdCount++;
                }

                importProductMode.delete(ctx.from.id);
                await ctx.reply(`✅ Успешно загружено ${createdCount} товаров!`);
                await showDataMenu(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при загрузке товаров:', error);
                await ctx.reply('❌ Ошибка при загрузке товаров: ' + error.message);
            }
            return;
        }

        // Проверяем, находится ли администратор в режиме ответа
        if (adminReplyMode.has(ctx.from.id)) {
            const userChatId = adminReplyMode.get(ctx.from.id);
            let messageText = ctx.message.text;

            // Если это команда /reply, извлекаем текст
            if (messageText.startsWith('/reply ')) {
                messageText = messageText.substring(7).trim();
            }

            if (!messageText || messageText.length === 0) {
                await ctx.reply('❌ Укажите текст ответа.');
                return;
            }

            try {
                // Сохраняем ответ администратора
                await supportService.saveAdminMessage(userChatId, ctx.from.id, messageText);

                // Отправляем сообщение пользователю
                try {
                    await bot.telegram.sendMessage(
                        userChatId,
                        `💬 <b>Ответ от администратора:</b>\n\n${messageText}`,
                        { parse_mode: 'HTML' }
                    );
                    await ctx.reply(`✅ Ответ отправлен пользователю!`);
                } catch (error) {
                    await ctx.reply(`✅ Ответ сохранен, но не удалось отправить пользователю: ${error.message}`);
                }

                adminReplyMode.delete(ctx.from.id);
                await showConversation(ctx, userChatId);
            } catch (error) {
                await ctx.reply(`❌ Ошибка: ${error.message}`);
            }
            return; // Явно указываем, что сообщение обработано
        }
    });

    // Меню работы с данными
    async function showDataMenu(ctx) {
        if (!isAdmin(ctx.from.id)) {
            if (ctx.callbackQuery) {
                await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
            } else {
                await ctx.reply('❌ У вас нет доступа к админ-панели.');
            }
            return;
        }

        const text = `
💾 <b>Управление данными</b>

Данная настройка дает вам возможность загружать и выгружать все данные.

⚠️ <b>ВНИМАНИЕ! Осторожно!</b> При загрузке новых данных, все предыдущие данные будут стерты!

Выберите действие:
        `.trim();

        const keyboard = {
            inline_keyboard: [
                [{ text: '📥 Выгрузить все товары', callback_data: 'export_products' }],
                [{ text: '📥 Выгрузить все платежные данные', callback_data: 'export_payments' }],
                [{ text: '📥 Выгрузить все фасовки', callback_data: 'export_packagings' }],
                [{ text: '📤 Загрузить готовые платежные адреса', callback_data: 'import_payments' }],
                [{ text: '📤 Загрузить готовые товары', callback_data: 'import_products' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    }

    // Выгрузка всех товаров в JSON
    async function exportProducts(ctx) {
        try {
            const cities = await cityService.getAll();
            const productsData = [];

            for (const city of cities) {
                const products = await productService.getByCityId(city.id);
                for (const product of products) {
                    productsData.push({
                        city_name: city.name,
                        name: product.name,
                        description: product.description || '',
                        price: product.price,
                        packaging_value: product.packaging_value || null
                    });
                }
            }

            const jsonData = JSON.stringify(productsData, null, 2);
            await ctx.reply('📥 <b>Выгрузка всех товаров</b>', { parse_mode: 'HTML' });
            await ctx.reply(`<pre>${jsonData}</pre>`, { parse_mode: 'HTML' });
            await showDataMenu(ctx);
        } catch (error) {
            console.error('[AdminHandlers] Ошибка при выгрузке товаров:', error);
            await ctx.reply('❌ Ошибка при выгрузке товаров: ' + error.message);
        }
    }

    // Выгрузка всех платежных данных в JSON
    async function exportPayments(ctx) {
        try {
            const methods = await paymentService.getAllMethods(true);
            const paymentsData = [];

            for (const method of methods) {
                const address = await paymentService.getAddressForMethod(method.id);
                paymentsData.push({
                    name: method.name,
                    network: method.network,
                    type: method.type || 'crypto',
                    enabled: method.enabled === 1,
                    address: address ? address.address : null
                });
            }

            const jsonData = JSON.stringify(paymentsData, null, 2);
            await ctx.reply('📥 <b>Выгрузка всех платежных данных</b>', { parse_mode: 'HTML' });
            await ctx.reply(`<pre>${jsonData}</pre>`, { parse_mode: 'HTML' });
            await showDataMenu(ctx);
        } catch (error) {
            console.error('[AdminHandlers] Ошибка при выгрузке платежных данных:', error);
            await ctx.reply('❌ Ошибка при выгрузке платежных данных: ' + error.message);
        }
    }

    // Выгрузка всех фасовок в JSON
    async function exportPackagings(ctx) {
        try {
            const packagings = await packagingService.getAll();
            const packagingsData = packagings.map(p => ({
                value: p.value
            }));

            const jsonData = JSON.stringify(packagingsData, null, 2);
            await ctx.reply('📥 <b>Выгрузка всех фасовок</b>', { parse_mode: 'HTML' });
            await ctx.reply(`<pre>${jsonData}</pre>`, { parse_mode: 'HTML' });
            await showDataMenu(ctx);
        } catch (error) {
            console.error('[AdminHandlers] Ошибка при выгрузке фасовок:', error);
            await ctx.reply('❌ Ошибка при выгрузке фасовок: ' + error.message);
        }
    }

    // Загрузка платежных адресов из JSON
    const importPaymentMode = new Map(); // userId -> true

    bot.action('import_payments', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        importPaymentMode.set(ctx.from.id, true);
        await ctx.reply(
            '📤 <b>Загрузка платежных адресов</b>\n\n' +
            '⚠️ <b>ВНИМАНИЕ!</b> Все существующие платежные методы и адреса будут удалены!\n\n' +
            'Отправьте JSON файл или текст в формате JSON.\n' +
            'Формат:\n' +
            '<pre>[\n' +
            '  {\n' +
            '    "name": "Bitcoin",\n' +
            '    "network": "BTC",\n' +
            '    "type": "crypto",\n' +
            '    "enabled": true,\n' +
            '    "address": "1c2b3a4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b"\n' +
            '  }\n' +
            ']</pre>\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    // Загрузка товаров из JSON
    bot.action('import_products', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        importProductMode.set(ctx.from.id, true);
        await ctx.reply(
            '📤 <b>Загрузка товаров</b>\n\n' +
            '⚠️ <b>ВНИМАНИЕ!</b> Все существующие товары будут удалены!\n\n' +
            'Отправьте JSON файл или текст в формате JSON.\n' +
            'Формат:\n' +
            '<pre>[\n' +
            '  {\n' +
            '    "city_name": "Москва",\n' +
            '    "name": "Товар 1",\n' +
            '    "description": "Описание",\n' +
            '    "price": 1000,\n' +
            '    "packaging_value": 1\n' +
            '  }\n' +
            ']</pre>\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    // Обработка выгрузки данных
    bot.action('export_products', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await exportProducts(ctx);
    });

    bot.action('export_payments', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await exportPayments(ctx);
    });

    bot.action('export_packagings', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await exportPackagings(ctx);
    });


    console.log('[AdminHandlers] Админ-обработчики успешно настроены');
    console.log('[AdminHandlers] Зарегистрированы команды: /apanel и другие админ-команды');
}

