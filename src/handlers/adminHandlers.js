import { config } from '../config/index.js';
import { cityService } from '../services/cityService.js';
import { districtService } from '../services/districtService.js';
import { productService } from '../services/productService.js';
import { paymentService } from '../services/paymentService.js';
import { packagingService } from '../services/packagingService.js';
import { userService } from '../services/userService.js';
import { cardAccountService } from '../services/cardAccountService.js';
import { supportService } from '../services/supportService.js';
import { settingsService } from '../services/settingsService.js';
import { statisticsService } from '../services/statisticsService.js';
import { menuButtonService } from '../services/menuButtonService.js';
import { promocodeService } from '../services/promocodeService.js';
import { database } from '../database/db.js';
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const adminSessions = new Map(); // Хранит активные сессии админов

// Экспортируем adminSessions для использования в userHandlers
export { adminSessions };
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

                // Показываем админские reply keyboard кнопки
                await showAdminMenuKeyboard(ctx);

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

    // Функция для получения админских reply keyboard кнопок
    function getAdminMenuKeyboard() {
        const keyboard = [
            ['Управление городами', 'Управление товарами'],
            ['Управление фасовками', 'Управление методами оплаты'],
            ['Управление карточными счетами', 'Чаты'],
            ['Создать уведомление', 'Данные'],
            ['Статистика'],
            ['Настройка приветственного сообщения', 'Настройка кнопок'],
            ['Настройка иконок', 'Бонусы и промокоды'],
            ['Выход из админ-панели']
        ];

        return {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: false
        };
    }

    // Функция для показа админских reply keyboard кнопок
    async function showAdminMenuKeyboard(ctx) {
        const keyboard = getAdminMenuKeyboard();
        await ctx.reply('Кнопки меню изменены согласно роли администратора', {
            reply_markup: keyboard
        });
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
                    [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
                    [{ text: '👋 Настройка приветственного сообщения', callback_data: 'admin_welcome' }],
                    [{ text: '🔘 Настройка кнопок', callback_data: 'admin_menu_buttons' }],
                    [{ text: '🎨 Настройка иконок', callback_data: 'admin_icons' }],
                    [{ text: '🎁 Бонусы и промокоды', callback_data: 'admin_promocodes' }],
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

    bot.action('admin_welcome', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showWelcomeSettings(ctx);
    });

    bot.action('admin_menu_buttons', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showMenuButtonsAdmin(ctx);
    });

    bot.action('admin_promocodes', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPromocodesAdmin(ctx);
    });

    bot.action('admin_icons', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showIconsSettings(ctx);
    });

    bot.action('admin_stats', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showStatisticsAdmin(ctx);
    });

    // Обработчики для админских reply keyboard кнопок
    bot.hears('Управление городами', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCitiesAdmin(ctx);
    });

    bot.hears('Управление товарами', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showProductsAdmin(ctx);
    });

    bot.hears('Управление фасовками', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPackagingsAdmin(ctx);
    });

    bot.hears('Управление методами оплаты', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPaymentsAdmin(ctx);
    });

    bot.hears('Управление карточными счетами', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCardsAdmin(ctx);
    });

    bot.hears('Чаты', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showChatsMenu(ctx);
    });

    bot.hears('Создать уведомление', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showNotificationMenu(ctx);
    });

    bot.hears('Данные', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showDataMenu(ctx);
    });

    bot.hears('Статистика', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showStatisticsAdmin(ctx);
    });

    bot.hears('Настройка приветственного сообщения', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showWelcomeSettings(ctx);
    });

    bot.hears('Настройка кнопок', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showMenuButtonsAdmin(ctx);
    });

    bot.hears('Настройка иконок', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showIconsSettings(ctx);
    });

    bot.hears('Бонусы и промокоды', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showPromocodesAdmin(ctx);
    });

    bot.hears('Выход из админ-панели', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
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
        }

        await ctx.reply('✅ Вы вышли из админ-панели. Пользовательское меню восстановлено.');

        // Показываем пользовательские reply keyboard кнопки
        const topButtons = [
            ['Каталог', 'Мой кабинет'],
            ['Помощь', 'Отзывы']
        ];
        const menuButtons = await menuButtonService.getAll(true);
        const dynamicButtons = menuButtons.map(btn => [btn.name]);
        const keyboard = [...topButtons, ...dynamicButtons];

        await ctx.reply('Выберите действие:', {
            reply_markup: {
                keyboard: keyboard,
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
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

        // Показываем reply keyboard снова
        const topButtons = [
            ['Каталог', 'Мой кабинет'],
            ['Помощь', 'Отзывы']
        ];
        const menuButtons = await menuButtonService.getAll(true);
        const dynamicButtons = menuButtons.map(btn => [btn.name]);
        const keyboard = [...topButtons, ...dynamicButtons];

        await ctx.reply('Выберите действие:', {
            reply_markup: {
                keyboard: keyboard,
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
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

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '❌ Отмена', callback_data: 'admin_panel' }]
            ]
        };

        // Если это callback query, редактируем сообщение, иначе отправляем новое
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

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '➕ Добавить карточный счет', callback_data: 'admin_card_add' }],
                [{ text: '🗑️ Удалить карточный счет', callback_data: 'admin_card_delete' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        // Если это callback query, редактируем сообщение, иначе отправляем новое
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

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '➕ Добавить город', callback_data: 'admin_city_add' }],
                [{ text: '🗑️ Удалить город', callback_data: 'admin_city_delete' }],
                [{ text: '📍 Управление районами', callback_data: 'admin_districts' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        // Если вызвано из callback-кнопки, пробуем отредактировать сообщение,
        // иначе (команда /addcity) отправляем новое сообщение
        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
            } catch (error) {
                // Если Telegram не позволяет редактировать (message can't be edited),
                // просто отправляем новое сообщение, чтобы не падать с 400
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
            const city = await cityService.create(cityName);
            // Автоматически создаем район "Центральный" для нового города
            await districtService.create(city.id, 'Центральный');
            await ctx.reply(`✅ Город "${cityName}" успешно добавлен! Район "Центральный" создан автоматически.`);
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

    // Управление районами
    bot.action('admin_districts', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showDistrictsAdmin(ctx);
    });

    async function showDistrictsAdmin(ctx) {
        const cities = await cityService.getAll();

        const text = `
📍 <b>Управление районами</b>

Выберите город для управления районами:
        `.trim();

        const keyboard = cities.map(city => [
            { text: `🏙️ ${city.name}`, callback_data: `admin_districts_city_${city.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_cities' }]);

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

    bot.action(/^admin_districts_city_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        await showDistrictsForCity(ctx, cityId);
    });

    async function showDistrictsForCity(ctx, cityId) {
        const city = await cityService.getById(cityId);
        if (!city) {
            await ctx.reply('Город не найден.');
            return;
        }

        const districts = await districtService.getByCityId(cityId);

        const text = `
📍 <b>Районы города: ${city.name}</b>

Список районов:
${districts.map(d => `• ${d.name}`).join('\n') || 'Районов пока нет'}
        `.trim();

        const keyboard = [
            [{ text: '➕ Добавить район', callback_data: `admin_district_add_${cityId}` }],
            [{ text: '✏️ Изменить район', callback_data: `admin_district_edit_${cityId}` }],
            [{ text: '🗑️ Удалить район', callback_data: `admin_district_delete_${cityId}` }],
            [{ text: '◀️ Назад к городам', callback_data: 'admin_districts' }]
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

    const districtAddMode = new Map(); // userId -> cityId
    const districtEditMode = new Map(); // userId -> { cityId, districtId }

    bot.action(/^admin_district_add_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        districtAddMode.set(ctx.from.id, cityId);
        await ctx.reply(
            'Введите название нового района:\n\nФормат: <code>/adddistrict Название района</code>',
            { parse_mode: 'HTML' }
        );
    });

    bot.command('adddistrict', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        if (!districtAddMode.has(ctx.from.id)) {
            await ctx.reply('❌ Сначала выберите город для добавления района.');
            return;
        }

        const cityId = districtAddMode.get(ctx.from.id);
        const args = ctx.message.text.split(' ').slice(1);
        const districtName = args.join(' ');

        if (!districtName) {
            await ctx.reply('❌ Укажите название района.\nФормат: /adddistrict Название района');
            return;
        }

        try {
            await districtService.create(cityId, districtName);
            districtAddMode.delete(ctx.from.id);
            await ctx.reply(`✅ Район "${districtName}" успешно добавлен!`);
            await showDistrictsForCity(ctx, cityId);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action(/^admin_district_edit_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        const districts = await districtService.getByCityId(cityId);

        if (districts.length === 0) {
            await ctx.editMessageText('Нет районов для изменения.');
            return;
        }

        const keyboard = districts.map(district => [
            { text: `✏️ ${district.name}`, callback_data: `admin_district_edit_select_${district.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: `admin_districts_city_${cityId}` }]);

        await ctx.editMessageText('Выберите район для изменения:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_district_edit_select_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        const district = await districtService.getById(districtId);

        if (!district) {
            await ctx.reply('Район не найден.');
            return;
        }

        districtEditMode.set(ctx.from.id, { cityId: district.city_id, districtId });
        await ctx.reply(
            `Введите новое название для района "${district.name}":\n\nФормат: <code>/editdistrict Новое название</code>`,
            { parse_mode: 'HTML' }
        );
    });

    bot.command('editdistrict', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            await ctx.reply('❌ У вас нет доступа.');
            return;
        }

        if (!districtEditMode.has(ctx.from.id)) {
            await ctx.reply('❌ Сначала выберите район для изменения.');
            return;
        }

        const { cityId, districtId } = districtEditMode.get(ctx.from.id);
        const args = ctx.message.text.split(' ').slice(1);
        const newName = args.join(' ');

        if (!newName) {
            await ctx.reply('❌ Укажите новое название района.\nФормат: /editdistrict Новое название');
            return;
        }

        try {
            await districtService.update(districtId, newName);
            districtEditMode.delete(ctx.from.id);
            await ctx.reply(`✅ Район успешно изменен на "${newName}"!`);
            await showDistrictsForCity(ctx, cityId);
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action(/^admin_district_delete_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        const districts = await districtService.getByCityId(cityId);

        if (districts.length === 0) {
            await ctx.editMessageText('Нет районов для удаления.');
            return;
        }

        const keyboard = districts.map(district => [
            { text: `🗑️ ${district.name}`, callback_data: `admin_district_del_${district.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: `admin_districts_city_${cityId}` }]);

        await ctx.editMessageText('Выберите район для удаления:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_district_del_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        const district = await districtService.getById(districtId);

        if (!district) {
            await ctx.reply('Район не найден.');
            return;
        }

        try {
            await districtService.delete(districtId);
            await ctx.editMessageText('✅ Район успешно удален!');
            await showDistrictsForCity(ctx, district.city_id);
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
            { text: `🏙️ ${city.name}`, callback_data: `admin_products_city_${city.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_panel' }]);

        const replyMarkup = { inline_keyboard: keyboard };

        // Если это callback query, редактируем сообщение, иначе отправляем новое
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

    bot.action(/^admin_products_city_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        await showDistrictsForProducts(ctx, cityId);
    });

    async function showDistrictsForProducts(ctx, cityId) {
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

    bot.action(/^admin_products_district_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const districtId = parseInt(ctx.match[1]);
        await showDistrictProductsAdmin(ctx, districtId);
    });

    async function showDistrictProductsAdmin(ctx, districtId) {
        const district = await districtService.getById(districtId);
        if (!district) {
            await ctx.reply('Район не найден.');
            return;
        }

        const city = await cityService.getById(district.city_id);
        const products = await productService.getByDistrictId(districtId);

        const text = `
📦 <b>Товары в районе: ${district.name} (${city.name})</b>

${products.map(p => {
            const packagingLabel = p.packaging_value ? ` (${p.packaging_value} кг)` : '';
            return `• ${p.name}${packagingLabel} - ${p.price} ₽`;
        }).join('\n') || 'Товаров пока нет'}
        `.trim();

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ Добавить товар', callback_data: `admin_product_add_${districtId}` }],
                            [{ text: '🗑️ Удалить товар', callback_data: `admin_product_delete_${districtId}` }],
                            [{ text: '◀️ Назад к районам', callback_data: `admin_products_city_${city.id}` }]
                        ]
                    }
                });
            } catch (error) {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ Добавить товар', callback_data: `admin_product_add_${districtId}` }],
                            [{ text: '🗑️ Удалить товар', callback_data: `admin_product_delete_${districtId}` }],
                            [{ text: '◀️ Назад к районам', callback_data: `admin_products_city_${city.id}` }]
                        ]
                    }
                });
            }
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ Добавить товар', callback_data: `admin_product_add_${districtId}` }],
                        [{ text: '🗑️ Удалить товар', callback_data: `admin_product_delete_${districtId}` }],
                        [{ text: '◀️ Назад к районам', callback_data: `admin_products_city_${city.id}` }]
                    ]
                }
            });
        }
    }

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
                districtId,
                name,
                description.trim(),
                priceNum,
                packaging.id
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

    // Управление методами оплаты
    async function showPaymentsAdmin(ctx) {
        const methods = await paymentService.getAllMethods(true);

        const text = `
💳 <b>Управление методами оплаты</b>

Доступные методы:
${methods.map(m => `• ${m.name} (${m.network})`).join('\n') || 'Методов оплаты пока нет'}
    `.trim();

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '➕ Добавить метод оплаты', callback_data: 'admin_payment_add' }],
                [{ text: '🔐 Изменить реквизиты', callback_data: 'admin_payment_address' }],
                [{ text: '🗑️ Удалить метод оплаты', callback_data: 'admin_payment_delete' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        // Если это callback query, редактируем сообщение, иначе отправляем новое
        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
            } catch (error) {
                // Если не удалось отредактировать, отправляем новое сообщение
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
            }
        } else {
            // Если это команда, отправляем новое сообщение
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        }
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

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '➕ Добавить фасовку', callback_data: 'admin_packaging_add' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        // Если это callback query, редактируем сообщение, иначе отправляем новое
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

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '📋 Последние', callback_data: 'admin_chats_recent' }],
                [{ text: '📚 Все чаты', callback_data: 'admin_chats_all' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        // Если это callback query, редактируем сообщение, иначе отправляем новое
        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
            } catch (error) {
                // Если не удалось отредактировать, отправляем новое сообщение
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
            }
        } else {
            // Если это команда или reply keyboard кнопка, отправляем новое сообщение
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        }
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
    const welcomeEditMode = new Map(); // userId -> true (режим редактирования приветственного сообщения)
    const iconEditMode = new Map(); // userId -> true (режим редактирования иконки городов)
    const databaseImportMode = new Map(); // userId -> true (режим загрузки БД)

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
    bot.on('text', async (ctx, next) => {
        // ВАЖНО: Пропускаем команды для ВСЕХ пользователей, чтобы они обрабатывались через bot.command()
        if (ctx.message.text && ctx.message.text.startsWith('/')) {
            // Обрабатываем только /cancel для админов
            if (ctx.message.text === '/cancel' && isAdmin(ctx.from.id)) {
                importPaymentMode.delete(ctx.from.id);
                importProductMode.delete(ctx.from.id);
                adminReplyMode.delete(ctx.from.id);
                welcomeEditMode.delete(ctx.from.id);
                iconEditMode.delete(ctx.from.id);
                databaseImportMode.delete(ctx.from.id);
                menuButtonEditMode.delete(ctx.from.id);
                promocodeAddMode.delete(ctx.from.id);
                promocodeAssignMode.delete(ctx.from.id);
                promocodeAssignAllMode.delete(ctx.from.id);
                await ctx.reply('❌ Операция отменена.');
                await showAdminPanel(ctx);
                return; // Не передаем дальше, так как команда обработана
            }
            // Для всех остальных команд передаем управление дальше через next()
            console.log('[AdminHandlers] bot.on(text): Пропуск команды (передаем дальше):', ctx.message.text);
            return next(); // Позволяем другим обработчикам (bot.command()) обработать команду
        }

        // Далее обрабатываем только для админов
        // ВАЖНО: для обычных пользователей обязательно вызываем next(),
        // чтобы их текстовые сообщения (в том числе нажатия на reply‑кнопки)
        // обрабатывались в userHandlers (bot.hears и bot.on('text'))
        if (!isAdmin(ctx.from.id)) {
            return next();
        }

        // Обработка редактирования приветственного сообщения
        if (welcomeEditMode.has(ctx.from.id)) {
            try {
                const newMessage = ctx.message.text;
                await settingsService.setWelcomeMessage(newMessage);
                welcomeEditMode.delete(ctx.from.id);
                await ctx.reply('✅ Приветственное сообщение успешно обновлено!');
                await showWelcomeSettings(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при сохранении приветственного сообщения:', error);
                await ctx.reply('❌ Ошибка при сохранении приветственного сообщения: ' + error.message);
            }
            return;
        }

        // Обработка редактирования иконки городов
        if (iconEditMode.has(ctx.from.id)) {
            try {
                const newIcon = ctx.message.text.trim();
                // Проверяем, что это одна иконка (эмодзи может быть длиннее из-за суррогатных пар)
                // Принимаем иконку длиной до 4 символов (для поддержки эмодзи с модификаторами)
                if (newIcon.length === 0 || newIcon.length > 4) {
                    await ctx.reply('❌ Пожалуйста, введите только одну иконку (эмодзи или символ).');
                    return;
                }
                await settingsService.setCityIcon(newIcon);
                iconEditMode.delete(ctx.from.id);
                await ctx.reply(`✅ Иконка для городов успешно обновлена на: ${newIcon}`);
                await showIconsSettings(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при сохранении иконки городов:', error);
                await ctx.reply('❌ Ошибка при сохранении иконки городов: ' + error.message);
            }
            return;
        }

        // Обработка добавления промокода
        if (promocodeAddMode.has(ctx.from.id)) {
            try {
                const text = ctx.message.text;

                // Парсим формат: "КОД|ПРОЦЕНТ"
                const parts = text.split('|');
                if (parts.length !== 2) {
                    await ctx.reply('❌ Неверный формат. Используйте: <code>КОД|ПРОЦЕНТ</code>\nПример: <code>SUMMER2024|15</code>', { parse_mode: 'HTML' });
                    return;
                }

                const code = parts[0].trim().toUpperCase();
                const discountPercent = parseInt(parts[1].trim());

                if (!code || code.length === 0) {
                    await ctx.reply('❌ Код промокода не может быть пустым.');
                    return;
                }

                if (isNaN(discountPercent) || discountPercent < 1 || discountPercent > 99) {
                    await ctx.reply('❌ Процент скидки должен быть числом от 1 до 99.');
                    return;
                }

                // Проверяем, не существует ли уже такой промокод
                const existing = await promocodeService.getByCode(code);
                if (existing) {
                    await ctx.reply(`❌ Промокод с кодом ${code} уже существует.`);
                    return;
                }

                await promocodeService.create(code, discountPercent, ctx.from.id);
                promocodeAddMode.delete(ctx.from.id);
                await ctx.reply(`✅ Промокод ${code} с скидкой ${discountPercent}% успешно создан!`);
                await showPromocodesAdmin(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при создании промокода:', error);
                await ctx.reply('❌ Ошибка при создании промокода: ' + error.message);
            }
            return;
        }

        // Обработка добавления/редактирования кнопок меню
        if (menuButtonEditMode.has(ctx.from.id)) {
            try {
                const editData = menuButtonEditMode.get(ctx.from.id);
                const text = ctx.message.text;

                // Парсим формат: "Название|Сообщение"
                const parts = text.split('|');
                if (parts.length !== 2) {
                    await ctx.reply('❌ Неверный формат. Используйте: <code>Название кнопки|Текст сообщения</code>', { parse_mode: 'HTML' });
                    return;
                }

                const name = parts[0].trim();
                const message = parts[1].trim();

                if (!name || !message) {
                    await ctx.reply('❌ Название и сообщение не могут быть пустыми.');
                    return;
                }

                if (editData.mode === 'add') {
                    // Добавляем новую кнопку
                    const buttons = await menuButtonService.getAll(false);
                    const maxOrder = buttons.length > 0
                        ? Math.max(...buttons.map(b => b.order_index || 0))
                        : -1;

                    await menuButtonService.create(name, message, maxOrder + 1);
                    menuButtonEditMode.delete(ctx.from.id);
                    await ctx.reply('✅ Кнопка успешно добавлена!');
                    await showMenuButtonsAdmin(ctx);
                } else if (editData.mode === 'edit' && editData.id) {
                    // Редактируем существующую кнопку
                    await menuButtonService.update(editData.id, { name, message });
                    menuButtonEditMode.delete(ctx.from.id);
                    await ctx.reply('✅ Кнопка успешно обновлена!');
                    await showMenuButtonsAdmin(ctx);
                }
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при сохранении кнопки меню:', error);
                await ctx.reply('❌ Ошибка при сохранении кнопки: ' + error.message);
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

    // Обработка загрузки документов (SQL файлов БД)
    bot.on('document', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;

        // Проверяем, находится ли администратор в режиме загрузки БД
        if (databaseImportMode.has(ctx.from.id)) {
            try {
                const document = ctx.message.document;

                // Проверяем, что это SQL файл
                if (!document.file_name || !document.file_name.endsWith('.sql')) {
                    await ctx.reply('❌ Ошибка: Файл должен иметь расширение .sql');
                    return;
                }

                await ctx.reply('📥 Загрузка SQL файла...');

                // Получаем файл
                const file = await bot.telegram.getFile(document.file_id);
                const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

                // Скачиваем файл
                const response = await fetch(fileUrl);
                const sqlContent = await response.text();

                await ctx.reply('💾 Создание резервной копии текущей БД...');

                // Создаем резервную копию текущей БД
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = dirname(__filename);
                const dbPath = config.dbPath.startsWith('./') || config.dbPath.startsWith('../')
                    ? join(__dirname, '../..', config.dbPath)
                    : config.dbPath;

                const backupPath = `${dbPath}.backup_${Date.now()}`;
                if (existsSync(dbPath)) {
                    copyFileSync(dbPath, backupPath);
                }

                await ctx.reply('🔄 Восстановление БД из SQL файла...');

                // Закрываем текущее подключение к БД
                await database.close();

                // Создаем новую БД из SQL файла
                const newDb = new sqlite3.Database(dbPath);

                // Выполняем SQL команды из файла
                const statements = sqlContent
                    .split(';')
                    .map(s => s.trim())
                    .filter(s => s.length > 0 && !s.startsWith('--'));

                for (const statement of statements) {
                    await new Promise((resolve, reject) => {
                        newDb.run(statement, (err) => {
                            if (err) {
                                console.error('[AdminHandlers] Ошибка при выполнении SQL:', err);
                                console.error('[AdminHandlers] SQL:', statement.substring(0, 100));
                            }
                            resolve();
                        });
                    });
                }

                newDb.close();

                // Переподключаемся к БД
                await database.reconnect();

                databaseImportMode.delete(ctx.from.id);
                await ctx.reply(
                    '✅ <b>База данных успешно загружена!</b>\n\n' +
                    `Резервная копия сохранена: ${backupPath}\n\n` +
                    '⚠️ Рекомендуется перезапустить бота для применения изменений.',
                    { parse_mode: 'HTML' }
                );
                await showDataMenu(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при загрузке БД:', error);
                await ctx.reply('❌ Ошибка при загрузке БД: ' + error.message);
            }
            return;
        }
    });

    // Обработка загрузки документов (SQL файлов БД)
    bot.on('document', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;

        // Проверяем, находится ли администратор в режиме загрузки БД
        if (databaseImportMode.has(ctx.from.id)) {
            try {
                const document = ctx.message.document;

                // Проверяем, что это SQL файл
                if (!document.file_name || !document.file_name.endsWith('.sql')) {
                    await ctx.reply('❌ Ошибка: Файл должен иметь расширение .sql');
                    return;
                }

                await ctx.reply('📥 Загрузка SQL файла...');

                // Получаем файл
                const file = await bot.telegram.getFile(document.file_id);
                const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

                // Скачиваем файл
                const response = await fetch(fileUrl);
                const sqlContent = await response.text();

                await ctx.reply('💾 Создание резервной копии текущей БД...');

                // Создаем резервную копию текущей БД
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = dirname(__filename);
                const dbPath = config.dbPath.startsWith('./') || config.dbPath.startsWith('../')
                    ? join(__dirname, '../..', config.dbPath)
                    : config.dbPath;

                const backupPath = `${dbPath}.backup_${Date.now()}`;
                if (existsSync(dbPath)) {
                    copyFileSync(dbPath, backupPath);
                }

                await ctx.reply('🔄 Восстановление БД из SQL файла...');

                // Закрываем текущее подключение к БД
                await database.close();

                // Удаляем старую БД
                if (existsSync(dbPath)) {
                    unlinkSync(dbPath);
                }

                // Создаем новую БД из SQL файла
                const newDb = new sqlite3.Database(dbPath);

                // Выполняем SQL команды из файла
                const statements = sqlContent
                    .split(';')
                    .map(s => s.trim())
                    .filter(s => s.length > 0 && !s.startsWith('--'));

                for (const statement of statements) {
                    await new Promise((resolve, reject) => {
                        newDb.run(statement, (err) => {
                            if (err) {
                                console.error('[AdminHandlers] Ошибка при выполнении SQL:', err);
                                console.error('[AdminHandlers] SQL:', statement.substring(0, 100));
                            }
                            resolve();
                        });
                    });
                }

                newDb.close();

                // Переподключаемся к БД
                await database.reconnect();

                databaseImportMode.delete(ctx.from.id);
                await ctx.reply(
                    '✅ <b>База данных успешно загружена!</b>\n\n' +
                    `Резервная копия сохранена: ${backupPath}\n\n` +
                    '⚠️ Рекомендуется перезапустить бота для применения изменений.',
                    { parse_mode: 'HTML' }
                );
                await showDataMenu(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при загрузке БД:', error);
                await ctx.reply('❌ Ошибка при загрузке БД: ' + error.message);
            }
            return;
        }
    });

    // Настройка приветственного сообщения
    async function showWelcomeSettings(ctx) {
        if (!isAdmin(ctx.from.id)) {
            if (ctx.callbackQuery) {
                await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
            } else {
                await ctx.reply('❌ У вас нет доступа к админ-панели.');
            }
            return;
        }

        const currentMessage = await settingsService.getWelcomeMessage();

        const text = `
👋 <b>Настройка приветственного сообщения</b>

Текущее приветственное сообщение:

<pre>${currentMessage.substring(0, 200)}${currentMessage.length > 200 ? '...' : ''}</pre>

Выберите действие:
        `.trim();

        const keyboard = {
            inline_keyboard: [
                [{ text: '✏️ Редактировать сообщение', callback_data: 'edit_welcome' }],
                [{ text: '👁️ Просмотреть полный текст', callback_data: 'view_welcome' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            } catch (error) {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            }
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    }

    bot.action('edit_welcome', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        welcomeEditMode.set(ctx.from.id, true);
        await ctx.reply(
            '✏️ <b>Редактирование приветственного сообщения</b>\n\n' +
            'Отправьте новое приветственное сообщение.\n' +
            'Вы можете использовать HTML разметку для форматирования.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('view_welcome', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const currentMessage = await settingsService.getWelcomeMessage();
        await ctx.reply(
            '👁️ <b>Текущее приветственное сообщение:</b>\n\n' +
            `<pre>${currentMessage}</pre>`,
            { parse_mode: 'HTML' }
        );
        await showWelcomeSettings(ctx);
    });

    // Настройка иконок
    async function showIconsSettings(ctx) {
        const currentIcon = await settingsService.getCityIcon();

        const text = `🎨 <b>Настройка иконок</b>\n\n` +
            `Текущая иконка для городов: <b>${currentIcon}</b>\n\n` +
            `Выберите действие:`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '✏️ Изменить иконку городов', callback_data: 'edit_city_icon' }],
                [{ text: '👁️ Просмотреть текущую иконку', callback_data: 'view_city_icon' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            } catch (error) {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            }
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    }

    bot.action('edit_city_icon', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        iconEditMode.set(ctx.from.id, true);
        await ctx.reply(
            '✏️ <b>Редактирование иконки для городов</b>\n\n' +
            'Отправьте новую иконку (эмодзи или символ).\n' +
            'Например: 📍, 🏙️, 🏛️, 🗺️ и т.д.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('view_city_icon', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const currentIcon = await settingsService.getCityIcon();
        await ctx.reply(
            '👁️ <b>Текущая иконка для городов:</b>\n\n' +
            `<b>${currentIcon}</b>\n\n` +
            `Пример использования: ${currentIcon} Москва`,
            { parse_mode: 'HTML' }
        );
        await showIconsSettings(ctx);
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
                [{ text: '💾 ВЫГРУЗИТЬ БД', callback_data: 'export_database' }],
                [{ text: '📥 ЗАГРУЗИТЬ БД', callback_data: 'import_database' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            } catch (error) {
                // Если не удалось отредактировать (например, сообщение не изменилось), игнорируем ошибку
                if (error.message && error.message.includes('message is not modified')) {
                    // Игнорируем эту ошибку - сообщение уже содержит нужный текст
                    return;
                }
                // Для других ошибок отправляем новое сообщение
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            }
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

    // Выгрузка базы данных в SQL формат
    async function exportDatabase(ctx) {
        try {
            await ctx.reply('💾 Создание SQL дампа базы данных...');

            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const dbPath = config.dbPath.startsWith('./') || config.dbPath.startsWith('../')
                ? join(__dirname, '../..', config.dbPath)
                : config.dbPath;

            // Получаем все таблицы
            const tables = await database.all(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            );

            let sqlDump = '-- SQL Dump of Telegram Bot Database\n';
            sqlDump += `-- Generated: ${new Date().toISOString()}\n\n`;

            // Для каждой таблицы получаем структуру и данные
            for (const table of tables) {
                const tableName = table.name;

                // Получаем CREATE TABLE statement
                const createTable = await database.get(
                    `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
                    [tableName]
                );

                if (createTable && createTable.sql) {
                    sqlDump += `-- Table: ${tableName}\n`;
                    sqlDump += `${createTable.sql};\n\n`;
                }

                // Получаем все данные из таблицы
                const rows = await database.all(`SELECT * FROM ${tableName}`);

                if (rows.length > 0) {
                    // Получаем названия колонок
                    const columns = Object.keys(rows[0]);

                    // Создаем INSERT statements
                    for (const row of rows) {
                        const values = columns.map(col => {
                            const value = row[col];
                            if (value === null) return 'NULL';
                            if (typeof value === 'string') {
                                return `'${value.replace(/'/g, "''")}'`;
                            }
                            return value;
                        });
                        sqlDump += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
                    }
                    sqlDump += '\n';
                }
            }

            // Сохраняем во временный файл
            const tempFilePath = join(__dirname, '../../database', `backup_${Date.now()}.sql`);
            writeFileSync(tempFilePath, sqlDump, 'utf8');

            // Отправляем файл администратору
            await ctx.replyWithDocument(
                { source: tempFilePath, filename: `database_backup_${Date.now()}.sql` },
                {
                    caption: '💾 <b>SQL дамп базы данных</b>\n\nФайл готов к загрузке.',
                    parse_mode: 'HTML'
                }
            );

            // Удаляем временный файл
            unlinkSync(tempFilePath);

            // Показываем меню данных только если это был callback query
            // Если это обычное сообщение, не показываем меню, чтобы избежать ошибки редактирования
            if (ctx.callbackQuery) {
                try {
                    await showDataMenu(ctx);
                } catch (error) {
                    // Если не удалось отредактировать сообщение, просто игнорируем ошибку
                    // Файл уже отправлен, это главное
                    console.error('[AdminHandlers] Ошибка при показе меню данных после выгрузки БД:', error.message);
                }
            }
        } catch (error) {
            console.error('[AdminHandlers] Ошибка при выгрузке БД:', error);
            await ctx.reply('❌ Ошибка при выгрузке БД: ' + error.message);
        }
    }

    bot.action('export_database', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await exportDatabase(ctx);
    });

    bot.action('import_database', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        databaseImportMode.set(ctx.from.id, true);
        await ctx.reply(
            '📥 <b>Загрузка базы данных</b>\n\n' +
            '⚠️ <b>ВНИМАНИЕ!</b> Текущая база данных будет заменена загруженной!\n' +
            'Резервная копия текущей БД будет создана автоматически.\n\n' +
            'Отправьте SQL файл базы данных.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    // Управление кнопками меню
    const menuButtonEditMode = new Map(); // userId -> { mode: 'add'|'edit', id?: number }
    const menuButtonDeleteMode = new Map(); // userId -> true

    async function showMenuButtonsAdmin(ctx) {
        if (!isAdmin(ctx.from.id)) {
            if (ctx.callbackQuery) {
                await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
            } else {
                await ctx.reply('❌ У вас нет доступа к админ-панели.');
            }
            return;
        }

        const buttons = await menuButtonService.getAll(false);
        const enabledButtons = buttons.filter(b => b.enabled === 1);
        const disabledButtons = buttons.filter(b => b.enabled === 0);

        let text = '🔘 <b>Настройка кнопок меню</b>\n\n';

        if (enabledButtons.length > 0) {
            text += '<b>Активные кнопки:</b>\n';
            enabledButtons.forEach((btn, index) => {
                text += `${index + 1}. ${btn.name}\n`;
            });
            text += '\n';
        }

        if (disabledButtons.length > 0) {
            text += '<b>Отключенные кнопки:</b>\n';
            disabledButtons.forEach((btn, index) => {
                text += `${index + 1}. ${btn.name} (отключена)\n`;
            });
            text += '\n';
        }

        if (buttons.length === 0) {
            text += 'Кнопок пока нет.\n\n';
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: '➕ Добавить кнопку', callback_data: 'admin_menu_button_add' }],
                [{ text: '✏️ Редактировать кнопку', callback_data: 'admin_menu_button_edit' }],
                [{ text: '🗑️ Удалить кнопку', callback_data: 'admin_menu_button_delete' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            } catch (error) {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            }
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    }

    bot.action('admin_menu_button_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        menuButtonEditMode.set(ctx.from.id, { mode: 'add' });
        await ctx.reply(
            '➕ <b>Добавление новой кнопки</b>\n\n' +
            'Отправьте данные в формате:\n' +
            '<code>Название кнопки|Текст сообщения</code>\n\n' +
            'Пример:\n' +
            '<code>Оператор|Свяжитесь с оператором: @operator</code>\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('admin_menu_button_edit', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const buttons = await menuButtonService.getAll(false);

        if (buttons.length === 0) {
            await ctx.editMessageText('Нет кнопок для редактирования.');
            return;
        }

        const keyboard = buttons.map(btn => [
            { text: `${btn.name}${btn.enabled === 0 ? ' (отключена)' : ''}`, callback_data: `admin_menu_button_edit_${btn.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_menu_buttons' }]);

        await ctx.editMessageText('Выберите кнопку для редактирования:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_menu_button_edit_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const buttonId = parseInt(ctx.match[1]);
        const button = await menuButtonService.getById(buttonId);

        if (!button) {
            await ctx.editMessageText('Кнопка не найдена.');
            return;
        }

        menuButtonEditMode.set(ctx.from.id, { mode: 'edit', id: buttonId });
        await ctx.reply(
            `✏️ <b>Редактирование кнопки: ${button.name}</b>\n\n` +
            'Отправьте новые данные в формате:\n' +
            '<code>Название кнопки|Текст сообщения</code>\n\n' +
            `Текущие данные:\n` +
            `Название: ${button.name}\n` +
            `Сообщение: ${button.message.substring(0, 50)}${button.message.length > 50 ? '...' : ''}\n\n` +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('admin_menu_button_delete', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const buttons = await menuButtonService.getAll(false);

        if (buttons.length === 0) {
            await ctx.editMessageText('Нет кнопок для удаления.');
            return;
        }

        const keyboard = buttons.map(btn => [
            { text: `🗑️ ${btn.name}`, callback_data: `admin_menu_button_del_${btn.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_menu_buttons' }]);

        await ctx.editMessageText('Выберите кнопку для удаления:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_menu_button_del_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const buttonId = parseInt(ctx.match[1]);

        try {
            await menuButtonService.delete(buttonId);
            await ctx.editMessageText('✅ Кнопка успешно удалена!');
            await showMenuButtonsAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    // Управление промокодами
    const promocodeAddMode = new Map(); // userId -> true (режим добавления промокода)
    const promocodeAssignMode = new Map(); // userId -> promocodeId (режим выдачи промокода пользователю)
    const promocodeAssignAllMode = new Map(); // userId -> promocodeId (режим выдачи промокода всем)

    async function showPromocodesAdmin(ctx) {
        if (!isAdmin(ctx.from.id)) {
            if (ctx.callbackQuery) {
                await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
            } else {
                await ctx.reply('❌ У вас нет доступа к админ-панели.');
            }
            return;
        }

        const promocodes = await promocodeService.getAll(true); // Только активные

        let text = '🎁 <b>Бонусы и промокоды</b>\n\n';

        if (promocodes.length === 0) {
            text += 'Нет используемых промокодов.\n';
        } else {
            text += '<b>Действующие промокоды:</b>\n\n';
            for (const promo of promocodes) {
                const expiresText = promo.expires_at
                    ? ` (до ${new Date(promo.expires_at).toLocaleDateString('ru-RU')})`
                    : ' (без срока действия)';
                text += `• <b>${promo.code}</b> - ${promo.discount_percent}%${expiresText}\n`;
            }
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: '➕ Добавить промокод', callback_data: 'admin_promocode_add' }],
                [{ text: '👤 Выдать промокод отдельному пользователю', callback_data: 'admin_promocode_assign_user' }],
                [{ text: '📢 Выдать промокод всем пользователям', callback_data: 'admin_promocode_assign_all' }],
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            } catch (error) {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            }
        } else {
            await ctx.reply(text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    }

    // Статистика
    async function showStatisticsAdmin(ctx) {
        if (!isAdmin(ctx.from.id)) {
            if (ctx.callbackQuery) {
                await ctx.editMessageText('❌ У вас нет доступа к админ-панели.');
            } else {
                await ctx.reply('❌ У вас нет доступа к админ-панели.');
            }
            return;
        }

        // Получаем все необходимые метрики
        const [
            userCount,
            totalProducts,
            totalProductsValue,
            averageOrderValue,
            totalSales,
            monthlySales,
            weeklySales,
            dailySales,
            mostPopular,
            leastPopular
        ] = await Promise.all([
            statisticsService.getUserCount(),
            statisticsService.getTotalProductsCount(),
            statisticsService.getTotalProductsValue(),
            statisticsService.getAverageOrderValue(),
            statisticsService.getTotalSales(),
            statisticsService.getMonthlySales(),
            statisticsService.getWeeklySales(),
            statisticsService.getDailySales(),
            statisticsService.getMostPopularProduct(),
            statisticsService.getLeastPopularProduct()
        ]);

        const formatCurrency = (value) =>
            `${(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;

        const mostPopularText = mostPopular
            ? `${mostPopular.name}${mostPopular.packaging_value ? ` (${mostPopular.packaging_value} кг)` : ''} — ${mostPopular.view_count} просмотров`
            : 'Нет данных';

        const leastPopularText = leastPopular
            ? `${leastPopular.name}${leastPopular.packaging_value ? ` (${leastPopular.packaging_value} кг)` : ''} — ${leastPopular.view_count} просмотров`
            : 'Нет данных';

        const text = `
📊 <b>Статистика бота</b>

👥 <b>Пользователи</b>
• Всего пользователей: <b>${userCount}</b>

📦 <b>Товары</b>
• Количество позиций: <b>${totalProducts}</b>
• Товаров на общую сумму: <b>${formatCurrency(totalProductsValue)}</b>

🛒 <b>Покупки</b>
• Средний чек: <b>${formatCurrency(averageOrderValue)}</b>
• Продажи за все время: <b>${formatCurrency(totalSales)}</b>
• Продажи за этот месяц: <b>${formatCurrency(monthlySales)}</b>
• Продажи за эту неделю: <b>${formatCurrency(weeklySales)}</b>
• Продажи за сегодня: <b>${formatCurrency(dailySales)}</b>

🔥 <b>Популярность товаров</b>
• Самый популярный товар: <b>${mostPopularText}</b>
• Самый непопулярный товар: <b>${leastPopularText}</b>
        `.trim();

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
            ]
        };

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

    bot.action('admin_promocode_add', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        promocodeAddMode.set(ctx.from.id, true);
        await ctx.reply(
            '➕ <b>Добавление нового промокода</b>\n\n' +
            'Отправьте данные в формате:\n' +
            '<code>КОД|ПРОЦЕНТ_СКИДКИ</code>\n\n' +
            'Пример:\n' +
            '<code>SUMMER2024|15</code>\n\n' +
            'Процент скидки должен быть от 1 до 99.\n\n' +
            'Для отмены отправьте /cancel',
            { parse_mode: 'HTML' }
        );
    });

    bot.action('admin_promocode_assign_user', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const promocodes = await promocodeService.getAll(true);

        if (promocodes.length === 0) {
            await ctx.editMessageText('Нет активных промокодов для выдачи.');
            return;
        }

        const keyboard = promocodes.map(promo => [
            { text: `${promo.code} (${promo.discount_percent}%)`, callback_data: `admin_promocode_assign_user_select_${promo.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_promocodes' }]);

        await ctx.editMessageText('Выберите промокод для выдачи пользователю:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_promocode_assign_user_select_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const promocodeId = parseInt(ctx.match[1]);
        promocodeAssignMode.set(ctx.from.id, promocodeId);

        const users = await userService.getAllUsers();

        if (users.length === 0) {
            await ctx.editMessageText('Нет пользователей для выдачи промокода.');
            return;
        }

        // Показываем список пользователей (первые 50)
        const usersList = users.slice(0, 50);
        const keyboard = usersList.map(user => [
            { text: `👤 Пользователь ${user.chat_id}`, callback_data: `admin_promocode_assign_to_${user.chat_id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_promocodes' }]);

        await ctx.editMessageText(
            `Выберите пользователя для выдачи промокода:\n\n` +
            `(Показано ${usersList.length} из ${users.length} пользователей)`,
            {
                reply_markup: { inline_keyboard: keyboard }
            }
        );
    });

    bot.action(/^admin_promocode_assign_to_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const userChatId = parseInt(ctx.match[1]);
        const promocodeId = promocodeAssignMode.get(ctx.from.id);

        if (!promocodeId) {
            await ctx.editMessageText('Ошибка: промокод не выбран.');
            return;
        }

        try {
            const promocode = await promocodeService.getById(promocodeId);
            await promocodeService.assignToUser(userChatId, promocodeId);

            const message = `Спасибо за использование нашего магазина, мы решили подарить вам промокод на следующие покупки, спасибо, что вы с нами! Ваш промокод: <b>${promocode.code}</b>`;

            try {
                await bot.telegram.sendMessage(userChatId, message, { parse_mode: 'HTML' });
                await ctx.editMessageText(`✅ Промокод ${promocode.code} успешно выдан пользователю!`);
            } catch (error) {
                await ctx.editMessageText(`✅ Промокод выдан, но не удалось отправить сообщение пользователю: ${error.message}`);
            }

            promocodeAssignMode.delete(ctx.from.id);
            await showPromocodesAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    bot.action('admin_promocode_assign_all', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const promocodes = await promocodeService.getAll(true);

        if (promocodes.length === 0) {
            await ctx.editMessageText('Нет активных промокодов для выдачи.');
            return;
        }

        const keyboard = promocodes.map(promo => [
            { text: `${promo.code} (${promo.discount_percent}%)`, callback_data: `admin_promocode_assign_all_confirm_${promo.id}` }
        ]);
        keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_promocodes' }]);

        await ctx.editMessageText('Выберите промокод для выдачи всем пользователям:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    });

    bot.action(/^admin_promocode_assign_all_confirm_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const promocodeId = parseInt(ctx.match[1]);

        try {
            const promocode = await promocodeService.getById(promocodeId);
            await ctx.editMessageText('📢 Выдача промокода всем пользователям...');

            const results = await promocodeService.assignToAllUsers(promocodeId);
            const assignedCount = results.filter(r => r.assigned).length;
            const alreadyAssignedCount = results.length - assignedCount;

            const message = `Спасибо за использование нашего магазина, мы решили подарить вам промокод на следующие покупки, спасибо, что вы с нами! Ваш промокод: <b>${promocode.code}</b>`;

            // Отправляем сообщение всем пользователям
            let sentCount = 0;
            let failedCount = 0;

            for (const result of results) {
                if (result.assigned) {
                    try {
                        await bot.telegram.sendMessage(result.user_chat_id, message, { parse_mode: 'HTML' });
                        sentCount++;
                    } catch (error) {
                        failedCount++;
                    }
                }
            }

            await ctx.editMessageText(
                `✅ Промокод ${promocode.code} выдан всем пользователям!\n\n` +
                `Выдано: ${assignedCount}\n` +
                `Уже было выдано: ${alreadyAssignedCount}\n` +
                `Сообщений отправлено: ${sentCount}\n` +
                `Ошибок отправки: ${failedCount}`
            );
            await showPromocodesAdmin(ctx);
        } catch (error) {
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });

    console.log('[AdminHandlers] Админ-обработчики успешно настроены');
    console.log('[AdminHandlers] Зарегистрированы команды: /apanel и другие админ-команды');
}

