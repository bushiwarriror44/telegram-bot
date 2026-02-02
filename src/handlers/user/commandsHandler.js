import { userService } from '../../services/userService.js';
import { settingsService } from '../../services/settingsService.js';
import { referralService } from '../../services/referralService.js';
import { showMenuKeyboard } from '../../utils/keyboardHelpers.js';
import { config } from '../../config/index.js';
import { generateCaptcha, saveCaptcha, getStartParam, validateCaptcha, hasActiveCaptcha } from '../../utils/captchaHelper.js';

/**
 * Вспомогательная функция для обработки команды /start после прохождения капчи
 * @param {Object} ctx - Контекст Telegraf
 * @param {Function} isAdmin - Функция проверки админа
 */
export async function processStartCommand(ctx, isAdmin) {
    try {
        // Проверяем, есть ли реферальный код в параметрах
        const startParam = ctx.message?.text?.split(' ')[1] || getStartParam(ctx.from.id);

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
        await showMenuKeyboard(ctx, isAdmin);
    } catch (error) {
        console.error('[UserHandlers] ОШИБКА в processStartCommand:', error);
        throw error;
    }
}

/**
 * Регистрирует обработчики команд пользователя
 * @param {Object} bot - Экземпляр Telegraf бота
 * @param {Function} isAdmin - Функция проверки админа
 */
export async function registerCommands(bot, isAdmin) {
    // Импортируем функции из других модулей
    const { showCitiesMenu } = await import('./catalogHandler.js');
    const { showCabinetMenu } = await import('./cabinetHandler.js');
    // Главное меню - выбор города
    bot.start(async (ctx) => {
        console.log('[UserHandlers] ========== Команда /start получена ==========');
        console.log('[UserHandlers] Пользователь ID:', ctx.from.id);
        console.log('[UserHandlers] Username:', ctx.from.username);
        console.log('[UserHandlers] Имя:', ctx.from.first_name);
        try {
            // Проверяем, включена ли капча
            if (config.captchaEnabled) {
                // Проверяем, не проходил ли пользователь капчу недавно (в течение 15 минут)
                const { isCaptchaRecentlyPassed } = await import('../../utils/captchaHelper.js');
                if (isCaptchaRecentlyPassed(ctx.from.id)) {
                    console.log('[UserHandlers] Капча была пройдена недавно, пропускаем проверку');
                    // Выполняем обычную логику без капчи
                    await processStartCommand(ctx, isAdmin);
                    return;
                }

                console.log('[UserHandlers] Капча включена, генерируем капчу...');
                const captcha = await generateCaptcha();
                saveCaptcha(ctx.from.id, captcha.imagePath, captcha.answer, captcha.options);

                // Отправляем изображение капчи
                try {
                    const { readFileSync } = await import('fs');
                    const { createCaptchaButtons } = await import('../../utils/captchaHelper.js');
                    const imageBuffer = readFileSync(captcha.imagePath);

                    const buttons = createCaptchaButtons(captcha.options);

                    await ctx.replyWithPhoto(
                        { source: imageBuffer },
                        {
                            caption: `🔒 <b>Проверка капчи</b>\n\n` +
                                `Выберите правильный вариант из кнопок ниже:`,
                            parse_mode: 'HTML',
                            reply_markup: buttons
                        }
                    );
                } catch (error) {
                    console.error('[UserHandlers] Ошибка при отправке изображения капчи:', error);
                    await ctx.reply(
                        `🔒 <b>Проверка безопасности</b>\n\n` +
                        `Произошла ошибка при генерации капчи. Попробуйте позже.`,
                        { parse_mode: 'HTML' }
                    );
                    return;
                }

                // Сохраняем параметры start для последующей обработки после прохождения капчи
                const startParam = ctx.message.text.split(' ')[1];
                if (startParam) {
                    // Сохраняем параметр start в специальном Map для последующей обработки
                    const { saveStartParam } = await import('../../utils/captchaHelper.js');
                    saveStartParam(ctx.from.id, startParam);
                }

                return; // Прерываем выполнение, ждем ответа на капчу
            }

            // Если капча отключена, выполняем обычную логику
            await processStartCommand(ctx, isAdmin);
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

    // Обработчик кнопок капчи теперь не нужен - они обрабатываются через bot.on('text')
    // так как кнопки теперь reply keyboard, а не inline keyboard
}
