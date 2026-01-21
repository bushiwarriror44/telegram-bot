import { settingsService } from '../../services/settingsService.js';
import { promocodeService } from '../../services/promocodeService.js';
import { menuButtonService } from '../../services/menuButtonService.js';
import { reviewService } from '../../services/reviewService.js';
import { paymentService } from '../../services/paymentService.js';
import { productService } from '../../services/productService.js';
import { cityService } from '../../services/cityService.js';
import { districtService } from '../../services/districtService.js';
import { packagingService } from '../../services/packagingService.js';
import { supportService } from '../../services/supportService.js';
import { database } from '../../database/db.js';
import { isAdmin } from './authHandler.js';
import { showAdminPanel } from './panelHandler.js';
import { showWelcomeSettings, welcomeEditMode, iconEditMode, referralDiscountEditMode, storefrontNameEditMode, currencyEditMode } from './settingsHandler.js';
import { showIconsSettings } from './settingsHandler.js';
import { showReferralSettings } from './settingsHandler.js';
import { showStorefrontNameSettings } from './settingsHandler.js';
import { showCurrencySettings } from './settingsHandler.js';
import { promocodeAddMode, promocodeAssignMode } from './promocodesHandler.js';
import { menuButtonEditMode } from './menuButtonsHandler.js';
import { reviewCreateMode } from './reviewsHandler.js';
import { importPaymentMode, importProductMode, databaseImportMode, showDataMenu } from './dataHandler.js';
import { adminReplyMode } from './chatsHandler.js';
import { showConversation } from './chatsHandler.js';
import { adminMessageUserMode } from './usersHandler.js';
import { channelBindMode } from './panelHandler.js';
import { reviewImportMode, showReviewsAdmin } from './reviewsHandler.js';
import { productImageUploadMode, productPackagingEditMode, predefinedProductSelectMode, predefinedProductCityMode, predefinedProductDistrictMode, predefinedProductAddMode, predefinedProductAddSource, predefinedPlacementMode, predefinedPlacementState, showDistrictsForPredefinedProduct, placePredefinedProduct, showPredefinedProducts, showPredefinedProductsManagement } from './productsHandler.js';
import { mockProducts } from '../../utils/mockData.js';
import { cardAddMode, showCardDetails } from './cardsHandler.js';
import { formatPackaging } from '../../utils/packagingHelper.js';
import { config } from '../../config/index.js';
import { hasActiveCaptcha } from '../../utils/captchaHelper.js';

/**
 * Регистрирует обработчики текстовых сообщений для админа
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerTextHandlers(bot) {
    bot.on('text', async (ctx, next) => {
        console.log('[AdminHandlers] bot.on(text) вызван для текста:', ctx.message.text, 'User ID:', ctx.from.id, 'Is Admin:', isAdmin(ctx.from.id));

        // ВАЖНО: Пропускаем команды для ВСЕХ пользователей, чтобы они обрабатывались через bot.command()
        if (ctx.message.text && ctx.message.text.startsWith('/')) {
            // Обрабатываем только /cancel для админов
            if (ctx.message.text === '/cancel' && isAdmin(ctx.from.id)) {
                // Очищаем все режимы
                importPaymentMode.delete(ctx.from.id);
                importProductMode.delete(ctx.from.id);
                adminReplyMode.delete(ctx.from.id);
                adminMessageUserMode.delete(ctx.from.id);
                welcomeEditMode.delete(ctx.from.id);
                iconEditMode.delete(ctx.from.id);
                databaseImportMode.delete(ctx.from.id);
                menuButtonEditMode.delete(ctx.from.id);
                promocodeAddMode.delete(ctx.from.id);
                promocodeAssignMode.delete(ctx.from.id);
                referralDiscountEditMode.delete(ctx.from.id);
                productImageUploadMode.delete(ctx.from.id);
                productPackagingEditMode.delete(ctx.from.id);
                channelBindMode.delete(ctx.from.id);
                reviewCreateMode.delete(ctx.from.id);
                reviewImportMode.delete(ctx.from.id);
                storefrontNameEditMode.delete(ctx.from.id);
                currencyEditMode.delete(ctx.from.id);
                cardAddMode.delete(ctx.from.id);
                predefinedProductSelectMode.delete(ctx.from.id);
                predefinedProductCityMode.delete(ctx.from.id);
                predefinedProductDistrictMode.delete(ctx.from.id);
                predefinedProductAddMode.delete(ctx.from.id);
                predefinedProductAddSource.delete(ctx.from.id);
                predefinedPlacementMode.delete(ctx.from.id);
                predefinedPlacementState.delete(ctx.from.id);
                await ctx.reply('❌ Операция отменена.');
                await showAdminPanel(ctx);
                return; // Не передаем дальше, так как команда обработана
            }
            // Для всех остальных команд передаем управление дальше через next()
            console.log('[AdminHandlers] bot.on(text): Пропуск команды (передаем дальше):', ctx.message.text);
            return next(); // Позволяем другим обработчикам (bot.command()) обработать команду
        }

        // ВАЖНО: Проверяем капчу ДО проверки админа, чтобы капча обрабатывалась для всех пользователей
        // Если у пользователя активна капча, передаем управление дальше в userHandlers
        if (config.captchaEnabled && hasActiveCaptcha(ctx.from.id)) {
            console.log('[AdminHandlers] У пользователя активна капча, передаем управление дальше для обработки капчи');
            return next();
        }

        // Далее обрабатываем только для админов
        // ВАЖНО: для обычных пользователей обязательно вызываем next(),
        // чтобы их текстовые сообщения (в том числе нажатия на reply‑кнопки)
        // обрабатывались в userHandlers (bot.hears и bot.on('text'))
        if (!isAdmin(ctx.from.id)) {
            console.log('[AdminHandlers] Пользователь не админ, передаем управление дальше через next()');
            return next();
        }

        // Список админских кнопок reply keyboard - пропускаем их через next(),
        // чтобы bot.hears() мог их обработать (с иконками и без)
        const adminButtons = [
            'Города', '📕 Города',
            'Прив. сообщение',
            'Районы', '📗 Районы',
            'Товар', '📦 Товар',
            'Фасовки', '🏷️ Фасовки',
            'Пользователи', '👥 Пользователи',
            'Рассылка', '✉️ Рассылка',
            'Валюта', '💱 Валюта',
            'Крипто адреса', '💳 Крипто адреса',
            'Кнопки', '🔲 Кнопки',
            'Карточные адреса', '💳 Карточные адреса',
            'Настройки', '⚙️ Настройки',
            'Выход из админ-панели'
        ];

        // Если это админская кнопка и пользователь не в режиме редактирования, пропускаем через next()
        if (adminButtons.includes(ctx.message.text)) {
            // Проверяем, не находится ли пользователь в каком-либо режиме редактирования
            const isInEditMode =
                welcomeEditMode.has(ctx.from.id) ||
                iconEditMode.has(ctx.from.id) ||
                referralDiscountEditMode.has(ctx.from.id) ||
                storefrontNameEditMode.has(ctx.from.id) ||
                currencyEditMode.has(ctx.from.id) ||
                importPaymentMode.has(ctx.from.id) ||
                importProductMode.has(ctx.from.id) ||
                databaseImportMode.has(ctx.from.id) ||
                menuButtonEditMode.has(ctx.from.id) ||
                promocodeAddMode.has(ctx.from.id) ||
                promocodeAssignMode.has(ctx.from.id) ||
                productImageUploadMode.has(ctx.from.id) ||
                productPackagingEditMode.has(ctx.from.id) ||
                channelBindMode.has(ctx.from.id) ||
                reviewCreateMode.has(ctx.from.id) ||
                reviewImportMode.has(ctx.from.id) ||
                adminReplyMode.has(ctx.from.id) ||
                cardAddMode.has(ctx.from.id);
            // режимы нового flow размещения
            const isInPlacementMode = predefinedPlacementMode.has(ctx.from.id);

            if (!isInEditMode && !isInPlacementMode) {
                console.log('[AdminHandlers] bot.on(text): Пропуск админской кнопки (передаем дальше через next()):', ctx.message.text);
                return next(); // Позволяем bot.hears() обработать кнопку
            }
        }

        console.log('[AdminHandlers] Пользователь админ, продолжаем обработку');

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

        // Обработка изменения валюты
        if (currencyEditMode.has(ctx.from.id)) {
            try {
                const newSymbol = ctx.message.text.trim();
                if (!newSymbol || newSymbol.length === 0) {
                    await ctx.reply('❌ Символ валюты не может быть пустым. Попробуйте еще раз.');
                    return;
                }
                await settingsService.setCurrencySymbol(newSymbol);
                currencyEditMode.delete(ctx.from.id);
                await ctx.reply(`✅ Символ валюты успешно изменен на "${newSymbol}"!`);
                await showCurrencySettings(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при сохранении символа валюты:', error);
                await ctx.reply('❌ Ошибка при сохранении символа валюты: ' + error.message);
            }
            return;
        }

        // Обработка изменения названия витрины
        if (storefrontNameEditMode.has(ctx.from.id)) {
            try {
                const newName = ctx.message.text.trim();
                if (newName.length === 0) {
                    await ctx.reply('❌ Название витрины не может быть пустым. Попробуйте еще раз.');
                    return;
                }
                await settingsService.setStorefrontName(newName);
                storefrontNameEditMode.delete(ctx.from.id);
                await ctx.reply('✅ Название витрины успешно обновлено!');
                await showStorefrontNameSettings(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при сохранении названия витрины:', error);
                await ctx.reply('❌ Ошибка при сохранении названия витрины: ' + error.message);
            }
            return;
        }

        // Обработка редактирования иконки городов
        if (iconEditMode.has(ctx.from.id)) {
            try {
                const newIcon = ctx.message.text.trim();
                // Проверяем, что это одна иконка (эмодзи может быть длиннее из-за суррогатных пар)
                // Принимаем иконку длиной до 4 символов (для поддержки эмодзи с модификаторами)
                // Разрешаем пустую строку для отключения иконки
                if (newIcon.length > 4) {
                    await ctx.reply('❌ Пожалуйста, введите только одну иконку (эмодзи или символ) или отправьте пустое сообщение для отключения иконки.');
                    return;
                }
                await settingsService.setCityIcon(newIcon);
                iconEditMode.delete(ctx.from.id);
                if (newIcon === '') {
                    await ctx.reply('✅ Иконка для городов отключена. Города будут отображаться без иконки.');
                } else {
                    await ctx.reply(`✅ Иконка для городов успешно обновлена на: ${newIcon}`);
                }
                await showIconsSettings(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при сохранении иконки городов:', error);
                await ctx.reply('❌ Ошибка при сохранении иконки городов: ' + error.message);
            }
            return;
        }

        // Обработка редактирования настроек реферальной системы
        if (referralDiscountEditMode.has(ctx.from.id)) {
            try {
                const editType = referralDiscountEditMode.get(ctx.from.id);
                const value = parseFloat(ctx.message.text.trim());

                if (isNaN(value) || value < 0 || value > 100) {
                    await ctx.reply('❌ Пожалуйста, введите корректное число от 0 до 100.');
                    return;
                }

                if (editType === 'discount') {
                    await settingsService.setReferralDiscountPercent(value);
                    await ctx.reply(`✅ Скидка за реферала успешно обновлена на: ${value}%`);
                } else if (editType === 'max_discount') {
                    await settingsService.setMaxReferralDiscountPercent(value);
                    await ctx.reply(`✅ Максимальная скидка успешно обновлена на: ${value}%`);
                } else if (editType === 'cashback') {
                    await settingsService.setReferralCashbackPercent(value);
                    await ctx.reply(`✅ Процент кешбека успешно обновлен на: ${value}%`);
                }

                referralDiscountEditMode.delete(ctx.from.id);
                await showReferralSettings(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при сохранении настроек реферальной системы:', error);
                await ctx.reply('❌ Ошибка при сохранении настроек: ' + error.message);
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
                    await ctx.reply('❌ Промокод с таким кодом уже существует.');
                    return;
                }

                await promocodeService.create(code, discountPercent);
                promocodeAddMode.delete(ctx.from.id);
                await ctx.reply(`✅ Промокод ${code} успешно создан!`);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при создании промокода:', error);
                await ctx.reply('❌ Ошибка при создании промокода: ' + error.message);
            }
            return;
        }

        // Обработка редактирования кнопок меню
        if (menuButtonEditMode.has(ctx.from.id)) {
            try {
                const editData = menuButtonEditMode.get(ctx.from.id);
                const text = ctx.message.text;

                // Парсим формат: "НАЗВАНИЕ|СООБЩЕНИЕ"
                const parts = text.split('|');
                if (parts.length !== 2) {
                    await ctx.reply('❌ Неверный формат. Используйте: <code>НАЗВАНИЕ|СООБЩЕНИЕ</code>', { parse_mode: 'HTML' });
                    return;
                }

                const name = parts[0].trim();
                const message = parts[1].trim();

                if (!name || name.length === 0) {
                    await ctx.reply('❌ Название кнопки не может быть пустым.');
                    return;
                }

                if (!message || message.length === 0) {
                    await ctx.reply('❌ Текст сообщения не может быть пустым.');
                    return;
                }

                if (editData.mode === 'add') {
                    await menuButtonService.create(name, message);
                    menuButtonEditMode.delete(ctx.from.id);
                    await ctx.reply(`✅ Кнопка "${name}" успешно добавлена!`);
                } else if (editData.mode === 'edit' && editData.id) {
                    await menuButtonService.update(editData.id, name, message);
                    menuButtonEditMode.delete(ctx.from.id);
                    await ctx.reply(`✅ Кнопка "${name}" успешно обновлена!`);
                }
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при сохранении кнопки меню:', error);
                await ctx.reply('❌ Ошибка при сохранении кнопки: ' + error.message);
            }
            return;
        }

        // Обработка создания отзыва вручную
        if (reviewCreateMode.has(ctx.from.id)) {
            try {
                const mode = reviewCreateMode.get(ctx.from.id);
                const step = mode.step;
                const data = mode.data || {};

                if (step === 'product') {
                    // Парсим название товара: "Город / Район / Товар фасовка"
                    const parts = ctx.message.text.split(' / ');
                    if (parts.length < 3) {
                        await ctx.reply('❌ Неверный формат. Используйте: <code>Город / Район / Товар фасовка</code>', {
                            parse_mode: 'HTML'
                        });
                        return;
                    }
                    data.product_name = ctx.message.text;
                    data.city_name = parts[0].trim();
                    data.district_name = parts[1].trim();
                    mode.step = 'rating';
                    mode.data = data;
                    reviewCreateMode.set(ctx.from.id, mode);
                    await ctx.reply(
                        '✏️ Введите оценку (от 1 до 5):',
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '1 ⭐', callback_data: 'review_rating_1' },
                                    { text: '2 ⭐', callback_data: 'review_rating_2' },
                                    { text: '3 ⭐', callback_data: 'review_rating_3' }],
                                    [{ text: '4 ⭐', callback_data: 'review_rating_4' },
                                    { text: '5 ⭐', callback_data: 'review_rating_5' }],
                                    [{ text: '◀️ Отмена', callback_data: 'admin_reviews' }]
                                ]
                            }
                        }
                    );
                } else if (step === 'text') {
                    data.review_text = ctx.message.text;
                    mode.step = 'date';
                    mode.data = data;
                    reviewCreateMode.set(ctx.from.id, mode);
                    await ctx.reply(
                        '✏️ Введите дату отзыва в формате <code>ДД.ММ.ГГГГ</code>:\n\n' +
                        'Пример: <code>30.12.2025</code>',
                        {
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '◀️ Отмена', callback_data: 'admin_reviews' }]
                                ]
                            }
                        }
                    );
                } else if (step === 'date') {
                    // Парсим дату в формате ДД.ММ.ГГГГ
                    const dateMatch = ctx.message.text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
                    if (!dateMatch) {
                        await ctx.reply('❌ Неверный формат даты. Используйте: <code>ДД.ММ.ГГГГ</code>', {
                            parse_mode: 'HTML'
                        });
                        return;
                    }
                    const [, day, month, year] = dateMatch;
                    data.review_date = `${year}-${month}-${day}`;

                    // Создаем отзыв
                    await reviewService.create(
                        data.product_name,
                        data.city_name,
                        data.district_name,
                        data.rating,
                        data.review_text,
                        data.review_date
                    );

                    reviewCreateMode.delete(ctx.from.id);
                    await ctx.reply('✅ Отзыв успешно создан!');
                    await showReviewsAdmin(ctx);
                }
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при создании отзыва:', error);
                await ctx.reply('❌ Ошибка при создании отзыва: ' + error.message);
                reviewCreateMode.delete(ctx.from.id);
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

                    // Находим район для города (берем первый)
                    const districts = await districtService.getByCityId(city.id);
                    const district = districts.length > 0 ? districts[0] : null;

                    if (!district) {
                        await ctx.reply(`❌ Для города ${city.name} не найден район. Создайте район сначала.`);
                        continue;
                    }

                    await productService.create(
                        city.id,
                        district.id,
                        item.name,
                        item.description || '',
                        item.price,
                        packagingId,
                        null // imagePath
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

        // Проверяем, находится ли администратор в режиме отправки сообщения пользователю
        if (adminMessageUserMode.has(ctx.from.id)) {
            const userChatId = adminMessageUserMode.get(ctx.from.id);
            let messageText = ctx.message.text;

            // Если это команда /cancel, отменяем отправку
            if (messageText === '/cancel') {
                adminMessageUserMode.delete(ctx.from.id);
                await ctx.reply('❌ Отправка сообщения отменена.');
                const { showMessageUserMenu } = await import('./usersHandler.js');
                await showMessageUserMenu(ctx);
                return;
            }

            if (!messageText || messageText.length === 0) {
                await ctx.reply('❌ Укажите текст сообщения.');
                return;
            }

            try {
                // Отправляем сообщение пользователю
                try {
                    await bot.telegram.sendMessage(
                        userChatId,
                        `${messageText}`,
                        { parse_mode: 'HTML' }
                    );
                    await ctx.reply(`✅ Сообщение отправлено пользователю!`);
                } catch (error) {
                    console.error('[AdminHandlers] Ошибка при отправке сообщения пользователю:', error);
                    if (error.code === 403) {
                        await ctx.reply(`❌ Не удалось отправить сообщение: пользователь заблокировал бота или не может получать сообщения.`);
                    } else {
                        await ctx.reply(`❌ Ошибка при отправке сообщения: ${error.message}`);
                    }
                }

                adminMessageUserMode.delete(ctx.from.id);
                const { showUsersAdmin } = await import('./usersHandler.js');
                await showUsersAdmin(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при обработке отправки сообщения:', error);
                await ctx.reply(`❌ Ошибка: ${error.message}`);
            }
            return; // Явно указываем, что сообщение обработано
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

        // Обработка редактирования фасовки товара
        if (productPackagingEditMode.has(ctx.from.id)) {
            try {
                const productId = productPackagingEditMode.get(ctx.from.id);
                const product = await productService.getById(productId);

                if (!product) {
                    await ctx.reply('Товар не найден.');
                    productPackagingEditMode.delete(ctx.from.id);
                    return;
                }

                const packagingValue = parseFloat(ctx.message.text.trim().replace(',', '.'));

                if (isNaN(packagingValue) || packagingValue <= 0) {
                    await ctx.reply('❌ Фасовка должна быть положительным числом. Попробуйте еще раз.\nПример: 0.5, 1, 2.5');
                    return;
                }

                // Проверяем, существует ли такая фасовка
                let packaging = await packagingService.getByValue(packagingValue);
                if (!packaging) {
                    await ctx.reply(
                        `❌ Фасовка ${formatPackaging(packagingValue)} не найдена.\n\n` +
                        `Сначала добавьте её в админ-панели (Фасовки).`
                    );
                    return;
                }

                // Обновляем фасовку товара
                await productService.update(product.id, product.name, product.description, product.price, packaging.id, product.image_path);

                // Получаем обновленный товар для отображения правильной фасовки
                const updatedProduct = await productService.getById(product.id);

                productPackagingEditMode.delete(ctx.from.id);

                // Показываем обновленное меню редактирования товара
                const district = await districtService.getById(product.district_id);
                const currencySymbol = await settingsService.getCurrencySymbol();
                const hasImage = product.image_path ? true : false;
                const imageStatus = hasImage ? '✅ Загружено' : '❌ Нет фото';
                const imageInstructions = hasImage
                    ? ''
                    : '\n\n📷 <b>Как добавить изображение:</b>\n' +
                    '1. Нажмите на кнопку "📷 Загрузить/Изменить фото" ниже\n' +
                    '2. Следуйте инструкциям для загрузки изображения\n' +
                    '3. Отправьте изображение как фото (не как документ)';

                await ctx.reply(
                    `✅ Фасовка успешно обновлена на ${formatPackaging(updatedProduct.packaging_value)}!\n\n` +
                    `✏️ <b>Редактирование товара: ${product.name}</b>\n\n` +
                    `Текущие данные:\n` +
                    `• Название: ${product.name}\n` +
                    `• Описание: ${product.description || 'Отсутствует'}\n` +
                    `• Цена: ${product.price} ${currencySymbol}\n` +
                    `• Фасовка: ${formatPackaging(updatedProduct.packaging_value)}\n` +
                    `• Фото: ${imageStatus}${imageInstructions}\n\n` +
                    `Выберите действие:`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: hasImage ? '📷 Изменить фото' : '📷 Загрузка фото (ИНФО)', callback_data: `admin_product_upload_photo_${product.id}` }],
                                [{ text: '🏷️ Изменить фасовку', callback_data: `admin_product_edit_packaging_${product.id}` }],
                                [{ text: '◀️ Назад к товарам', callback_data: `admin_products_district_${product.district_id}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при редактировании фасовки товара:', error);
                await ctx.reply('❌ Ошибка при редактировании фасовки: ' + error.message);
                productPackagingEditMode.delete(ctx.from.id);
            }
            return;
        }

        // Обработка добавления карты в карточный счет
        if (cardAddMode.has(ctx.from.id)) {
            try {
                const cardId = cardAddMode.get(ctx.from.id);
                const cardNumber = ctx.message.text.trim();

                if (!cardNumber || cardNumber.length === 0) {
                    await ctx.reply('❌ Номер карты не может быть пустым. Попробуйте еще раз.');
                    return;
                }

                await cardAccountService.addCard(cardId, cardNumber);
                cardAddMode.delete(ctx.from.id);
                await ctx.reply(`✅ Карта "${cardNumber}" успешно добавлена!`);
                await showCardDetails(ctx, cardId);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при добавлении карты:', error);
                await ctx.reply('❌ Ошибка при добавлении карты: ' + error.message);
            }
            return;
        }

        // Обработка ввода города для предустановленного товара
        if (predefinedProductSelectMode.get(ctx.from.id) === 'city_input') {
            try {
                const cityName = ctx.message.text.trim();
                if (!cityName || cityName.length === 0) {
                    await ctx.reply('❌ Название города не может быть пустым. Попробуйте еще раз.');
                    return;
                }

                // Проверяем, существует ли город
                let city = await cityService.getByName(cityName);
                if (!city) {
                    // Создаем город автоматически
                    city = await cityService.create(cityName);
                    // Создаем район "Центральный" для нового города
                    await districtService.create(city.id, 'Центральный');
                    await ctx.reply(`✅ Город "${cityName}" создан автоматически!`);
                }

                const productData = predefinedProductCityMode.get(ctx.from.id);
                if (!productData) {
                    await ctx.reply('❌ Ошибка: данные товара не найдены');
                    predefinedProductSelectMode.delete(ctx.from.id);
                    return;
                }

                predefinedProductSelectMode.delete(ctx.from.id);
                predefinedProductCityMode.delete(ctx.from.id);
                predefinedProductDistrictMode.set(ctx.from.id, {
                    ...productData,
                    cityId: city.id,
                    cityName: city.name
                });

                await showDistrictsForPredefinedProduct(ctx, city.id);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при обработке города:', error);
                await ctx.reply('❌ Ошибка: ' + error.message);
            }
            return;
        }

        // Обработка ввода района для предустановленного товара
        if (predefinedProductSelectMode.get(ctx.from.id) === 'district_input') {
            try {
                const districtName = ctx.message.text.trim();
                if (!districtName || districtName.length === 0) {
                    await ctx.reply('❌ Название района не может быть пустым. Попробуйте еще раз.');
                    return;
                }

                const productData = predefinedProductDistrictMode.get(ctx.from.id);
                if (!productData || !productData.cityId) {
                    await ctx.reply('❌ Ошибка: данные товара или города не найдены');
                    predefinedProductSelectMode.delete(ctx.from.id);
                    predefinedProductDistrictMode.delete(ctx.from.id);
                    return;
                }

                // Проверяем, существует ли район
                const districts = await districtService.getByCityId(productData.cityId);
                let district = districts.find(d => d.name.toLowerCase() === districtName.toLowerCase());

                if (!district) {
                    // Создаем район автоматически
                    district = await districtService.create(productData.cityId, districtName);
                    await ctx.reply(`✅ Район "${districtName}" создан автоматически!`);
                }

                predefinedProductSelectMode.delete(ctx.from.id);
                await placePredefinedProduct(ctx, district.id, productData);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при обработке района:', error);
                await ctx.reply('❌ Ошибка: ' + error.message);
            }
            return;
        }

        // Новый flow: ручной ввод города
        if (predefinedPlacementMode.get(ctx.from.id) === 'city_input') {
            const cityName = ctx.message.text.trim();
            if (!cityName) {
                await ctx.reply('❌ Название города не может быть пустым.');
                return;
            }
            let city = await cityService.getByName(cityName);
            if (!city) {
                city = await cityService.create(cityName);
                await districtService.create(city.id, 'Центральный');
                await ctx.reply(`✅ Город "${cityName}" создан автоматически!`);
            }
            const st = predefinedPlacementState.get(ctx.from.id);
            if (!st) return;
            st.cityId = city.id;
            st.cityName = city.name;
            st.districtIds = new Set();
            predefinedPlacementState.set(ctx.from.id, st);
            predefinedPlacementMode.delete(ctx.from.id);
            // Покажем районы (через триггер кнопки — просто вызываем handler через import)
            const { showPredefinedProductsForPlacement } = await import('./productsHandler.js'); // no-op, чтобы модуль был загружен
            await ctx.reply('✅ Город выбран. Теперь выберите районы кнопками в меню.');
            // пользователь продолжит через inline-клавиатуру (которая уже показана)
            return;
        }

        // Новый flow: ручной ввод района (добавляем и автоматически выбираем)
        if (predefinedPlacementMode.get(ctx.from.id) === 'district_input') {
            const districtName = ctx.message.text.trim();
            if (!districtName) {
                await ctx.reply('❌ Название района не может быть пустым.');
                return;
            }
            const st = predefinedPlacementState.get(ctx.from.id);
            if (!st?.cityId) {
                await ctx.reply('❌ Сначала выберите город.');
                predefinedPlacementMode.delete(ctx.from.id);
                return;
            }
            const existing = (await districtService.getByCityId(st.cityId)).find(d => d.name.toLowerCase() === districtName.toLowerCase());
            const district = existing || await districtService.create(st.cityId, districtName);
            if (!existing) await ctx.reply(`✅ Район "${districtName}" создан автоматически!`);
            if (!st.districtIds) st.districtIds = new Set();
            st.districtIds.add(district.id);
            predefinedPlacementState.set(ctx.from.id, st);
            predefinedPlacementMode.delete(ctx.from.id);
            await ctx.reply('✅ Район добавлен. Продолжайте выбор районов кнопками и нажмите "Готово".');
            return;
        }

        // Новый flow: ручной ввод фасовки (в граммах)
        if (predefinedPlacementMode.get(ctx.from.id) === 'packaging_input') {
            const raw = ctx.message.text.trim().toLowerCase();
            const cleaned = raw.replace(/\s/g, '').replace('гр', '').replace('g', '').replace(',', '.');
            const value = parseFloat(cleaned);
            if (isNaN(value) || value <= 0) {
                await ctx.reply('❌ Фасовка должна быть положительным числом (в граммах). Пример: 7.5 или 7,5гр');
                return;
            }
            const packaging = await packagingService.getOrCreate(value);
            const st = predefinedPlacementState.get(ctx.from.id);
            if (!st) return;
            st.packagingId = packaging.id;
            st.packagingValue = packaging.value;
            predefinedPlacementState.set(ctx.from.id, st);
            predefinedPlacementMode.set(ctx.from.id, 'price_input');
            await ctx.reply(`✅ Фасовка выбрана: ${formatPackaging(packaging.value)}.\n\nТеперь введите цену (только число):`);
            return;
        }

        // Новый flow: ввод цены и создание товаров во всех выбранных районах
        if (predefinedPlacementMode.get(ctx.from.id) === 'price_input') {
            const raw = ctx.message.text.trim().replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
            const price = parseFloat(raw);
            if (isNaN(price) || price <= 0) {
                await ctx.reply('❌ Цена должна быть положительным числом. Пример: 1000');
                return;
            }
            const st = predefinedPlacementState.get(ctx.from.id);
            if (!st?.cityId || !st?.districtIds?.size || !st?.packagingId) {
                await ctx.reply('❌ Не хватает данных (город/районы/фасовка). Пройдите шаги заново.');
                predefinedPlacementMode.delete(ctx.from.id);
                return;
            }
            st.price = price;
            predefinedPlacementState.set(ctx.from.id, st);

            let created = 0;
            for (const districtId of st.districtIds) {
                await productService.create(
                    st.cityId,
                    districtId,
                    st.name,
                    st.description || '',
                    price,
                    st.packagingId,
                    st.image_path || null
                );
                created += 1;
            }
            predefinedPlacementMode.delete(ctx.from.id);
            predefinedPlacementState.delete(ctx.from.id);
            await ctx.reply(`✅ Товар "${st.name}" добавлен в ${created} район(а/ов).`);
            return;
        }

        // Обработка добавления нового предустановленного товара
        if (predefinedProductAddMode.has(ctx.from.id)) {
            const mode = predefinedProductAddMode.get(ctx.from.id);
            const text = ctx.message.text.trim();

            if (!text || text.length === 0) {
                await ctx.reply('❌ Поле не может быть пустым. Попробуйте еще раз.');
                return;
            }

            try {
                if (mode === 'name') {
                    // Сохраняем название и переходим к описанию
                    predefinedProductCityMode.set(ctx.from.id, { name: text });
                    predefinedProductAddMode.set(ctx.from.id, 'description');
                    await ctx.reply(
                        '✅ Название сохранено!\n\n' +
                        'Введите описание товара:\n\n' +
                        'Для отмены отправьте /cancel'
                    );
                } else if (mode === 'description') {
                    // Сохраняем описание и завершаем создание шаблона (цена/фасовка задаются при размещении)
                    const productData = predefinedProductCityMode.get(ctx.from.id);
                    productData.description = text;

                    const { addMockProduct } = await import('../../utils/mockData.js');
                    addMockProduct({
                        name: productData.name,
                        description: productData.description
                    });

                    predefinedProductAddMode.delete(ctx.from.id);
                    predefinedProductCityMode.delete(ctx.from.id);

                    const source = predefinedProductAddSource.get(ctx.from.id) || 'products';
                    predefinedProductAddSource.delete(ctx.from.id);

                    await ctx.reply(
                        `✅ Предустановленный товар "${productData.name}" успешно добавлен!\n\n` +
                        `Цена и фасовка будут задаваться при размещении через "Фасовки".`
                    );

                    if (source === 'settings') {
                        await showPredefinedProductsManagement(ctx);
                    } else {
                        await showPredefinedProducts(ctx);
                    }
                }
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при добавлении предустановленного товара:', error);
                await ctx.reply('❌ Ошибка: ' + error.message);
            }
            return;
        }
    });
}
