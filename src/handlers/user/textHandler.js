import { userService } from '../../services/userService.js';
import { supportService } from '../../services/supportService.js';
import { paymentService } from '../../services/paymentService.js';
import { menuButtonService } from '../../services/menuButtonService.js';
import { promocodeService } from '../../services/promocodeService.js';
import { supportMode } from './supportHandler.js';
import { topupAmountMode } from './topupHandler.js';
import { promocodeInputMode } from './catalogHandler.js';
import { showTopupMethod } from './topupHandler.js';
import { createOrder } from './catalogHandler.js';
import { showCitiesMenu } from './catalogHandler.js';
import { showCabinetMenu } from './cabinetHandler.js';
import { showHelpMenu, showSupportInput } from './supportHandler.js';
import { showReviews } from './reviewsHandler.js';
import { settingsService } from '../../services/settingsService.js';
import { validateCaptcha, hasActiveCaptcha, generateCaptcha, saveCaptcha, getStartParam } from '../../utils/captchaHelper.js';

/**
 * Регистрирует обработчики текстовых сообщений
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerTextHandlers(bot) {
    // Обработка текстовых сообщений от пользователей
    // ВАЖНО: Этот обработчик должен регистрироваться ПЕРЕД bot.hears(),
    // чтобы он мог обработать динамические кнопки до того, как bot.hears() перехватит их
    bot.on('text', async (ctx, next) => {
        console.log('[TextHandler] bot.on(text) вызван для текста:', ctx.message.text);

        // Пропускаем команды - они должны обрабатываться через bot.command()
        if (ctx.message.text && ctx.message.text.startsWith('/')) {
            console.log('[TextHandler] bot.on(text): Пропуск команды (передаем дальше):', ctx.message.text);
            return next(); // позволяем другим middleware (командам) обработать
        }

        // Обработка ответа на капчу (если капча включена в админке)
        const captchaEnabled = await settingsService.getCaptchaEnabled();
        if (captchaEnabled && hasActiveCaptcha(ctx.from.id)) {
            const userAnswer = ctx.message.text.trim();
            const isValid = validateCaptcha(ctx.from.id, userAnswer);

            if (isValid) {
                // Капча пройдена, выполняем логику команды /start
                await ctx.reply('✅ Капча пройдена!');

                try {
                    // Импортируем функцию обработки start
                    const { processStartCommand } = await import('./commandsHandler.js');
                    const { getIsAdminFunction } = await import('../userHandlers.js');
                    const isAdmin = getIsAdminFunction();

                    // Выполняем логику start
                    await processStartCommand(ctx, isAdmin);
                } catch (error) {
                    console.error('[TextHandler] Ошибка при обработке start после капчи:', error);
                    await ctx.reply('Произошла ошибка. Попробуйте позже.');
                }
            } else {
                // Неверный ответ, генерируем новую капчу
                try {
                    const captcha = await generateCaptcha();
                    saveCaptcha(ctx.from.id, captcha.imagePath, captcha.answer, captcha.options);

                    const { readFileSync } = await import('fs');
                    const { createCaptchaButtons } = await import('../../utils/captchaHelper.js');
                    const fileBuffer = readFileSync(captcha.imagePath);

                    const buttons = createCaptchaButtons(captcha.options);

                    if (captcha.isSvg) {
                        await ctx.replyWithDocument(
                            { source: fileBuffer, filename: 'captcha.svg' },
                            {
                                caption: `❌ <b>Неверный ответ</b>\n\n` +
                                    `Попробуйте еще раз. Введите текст с изображения или выберите правильный вариант из кнопок:`,
                                parse_mode: 'HTML',
                                reply_markup: buttons
                            }
                        );
                    } else {
                        await ctx.replyWithPhoto(
                            { source: fileBuffer },
                            {
                                caption: `❌ <b>Неверный ответ</b>\n\n` +
                                    `Попробуйте еще раз. Введите текст с изображения или выберите правильный вариант из кнопок:`,
                                parse_mode: 'HTML',
                                reply_markup: buttons
                            }
                        );
                    }
                } catch (error) {
                    console.error('[TextHandler] Ошибка при генерации новой капчи:', error);
                    await ctx.reply(
                        `❌ <b>Неверный ответ</b>\n\n` +
                        `Произошла ошибка при генерации новой капчи. Попробуйте позже.`,
                        { parse_mode: 'HTML' }
                    );
                }
            }
            return; // Прерываем обработку, не передаем дальше
        }

        // Проверяем, находится ли пользователь в режиме поддержки
        if (supportMode.has(ctx.from.id)) {
            // Сохраняем сообщение пользователя
            await userService.saveOrUpdate(ctx.from.id, {
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name
            });

            const supportType = supportMode.get(ctx.from.id);
            await supportService.saveUserMessage(ctx.from.id, ctx.message.text, supportType);
            
            // Отправляем уведомление в канал
            console.log('[TextHandler] Отправка уведомления о сообщении поддержки');
            const { getNotificationServiceFromContext } = await import('../userHandlers.js');
            const notificationService = getNotificationServiceFromContext(ctx);
            if (notificationService) {
                console.log('[TextHandler] NotificationService найден, отправка уведомления');
                await notificationService.notifySupportMessage(ctx.from.id, ctx.message.text, supportType);
            } else {
                console.warn('[TextHandler] ⚠️ NotificationService не найден, уведомление не отправлено');
            }
            
            supportMode.delete(ctx.from.id);

            // Восстанавливаем обычную клавиатуру меню
            const { getMenuKeyboard } = await import('../../utils/keyboardHelpers.js');
            const keyboard = await getMenuKeyboard();

            await ctx.reply('✅ Ваше сообщение отправлено в поддержку. Мы свяжемся с вами как можно быстрее!', {
                reply_markup: keyboard
            });
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
            const { database } = await import('../../database/db.js');
            try {
                const lastTopup = await database.get(
                    'SELECT * FROM topups WHERE user_chat_id = ? AND payment_method_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
                    [ctx.from.id, methodId, 'pending']
                );

                if (lastTopup) {
                    await database.run(
                        'UPDATE topups SET amount = ? WHERE id = ?',
                        [amount, lastTopup.id]
                    );
                    console.log('[TextHandler] Обновлена запись о пополнении ID:', lastTopup.id, 'Сумма:', amount);
                } else {
                    const result = await database.run(
                        'INSERT INTO topups (user_chat_id, amount, payment_method_id, status) VALUES (?, ?, ?, ?)',
                        [ctx.from.id, amount, methodId, 'pending']
                    );
                    console.log('[TextHandler] Создана запись о пополнении с ID:', result.lastID, 'Сумма:', amount);
                }
            } catch (error) {
                console.error('[TextHandler] Ошибка при обновлении/создании записи о пополнении:', error);
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
            console.log('[TextHandler] Нажата кнопка метода оплаты:', clickedPaymentMethod.name);
            await showTopupMethod(ctx, clickedPaymentMethod.id);
            return;
        }

        // Обработка динамических кнопок меню
        console.log('[TextHandler] Проверка динамических кнопок для текста:', ctx.message.text);
        const menuButtons = await menuButtonService.getAll(true);
        console.log('[TextHandler] Найдено динамических кнопок:', menuButtons.length);

        const clickedButton = menuButtons.find(btn => btn.name === ctx.message.text);
        console.log('[TextHandler] Найдена кнопка?', !!clickedButton);

        if (clickedButton) {
            console.log('[TextHandler] Обработка нажатия на кнопку:', clickedButton.name);
            await userService.saveOrUpdate(ctx.from.id, {
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name
            });
            await ctx.reply(clickedButton.message, { parse_mode: 'HTML' });
            return;
        }

        // Если не обработано, передаем дальше к bot.hears()
        console.log('[TextHandler] Текст не обработан, передаем дальше к bot.hears()');
        return next();
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

    // Обработка кнопки "Поддержка"
    bot.hears(['💬 Поддержка', 'Поддержка', '🤷‍♂️ Поддержка'], async (ctx) => {
        await showHelpMenu(ctx);
    });

    // Обработка кнопок выбора типа обращения в поддержке
    bot.hears(['💬 Вопрос', 'Вопрос'], async (ctx) => {
        await showSupportInput(ctx, 'question');
    });

    bot.hears(['🚨 Проблема', 'Проблема'], async (ctx) => {
        await showSupportInput(ctx, 'problem');
    });

    bot.hears(['❗ У меня проблема с платежом'], async (ctx) => {
        await showSupportInput(ctx, 'payment_problem');
    });

    // Обработка кнопки "Назад" в режиме поддержки
    bot.hears(['◀️ Назад'], async (ctx) => {
        // Проверяем, находится ли пользователь в режиме поддержки
        if (supportMode.has(ctx.from.id)) {
            // Если пользователь в режиме ввода сообщения, возвращаем к выбору типа
            supportMode.delete(ctx.from.id);
            await showHelpMenu(ctx);
            return;
        }
        // Если не в режиме поддержки, восстанавливаем обычную клавиатуру меню
        const { getMenuKeyboard } = await import('../../utils/keyboardHelpers.js');
        const keyboard = await getMenuKeyboard();
        await ctx.reply('🕹 Главное меню:', {
            reply_markup: keyboard
        });
        return;
    });

    // Обработка кнопки "Отзывы" (может быть с количеством или без)
    bot.hears(/^📨 Отзывы( \(\d+\))?$/, async (ctx) => {
        await showReviews(ctx, 1);
    });

    // Также обрабатываем старый формат для совместимости
    bot.hears(['🛟 Отзывы', 'Отзывы'], async (ctx) => {
        await showReviews(ctx, 1);
    });
}
