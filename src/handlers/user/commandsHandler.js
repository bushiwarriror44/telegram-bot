import { userService } from '../../services/userService.js';
import { settingsService } from '../../services/settingsService.js';
import { referralService } from '../../services/referralService.js';
import { showMenuKeyboard } from '../../utils/keyboardHelpers.js';

/**
 * Регистрирует обработчики команд пользователя
 * @param {Object} bot - Экземпляр Telegraf бота
 * @param {Function} isAdmin - Функция проверки админа
 */
export async function registerCommands(bot, isAdmin) {
    // Импортируем функции из других модулей
    const { showStorefrontMenu } = await import('./catalogHandler.js');
    const { showCabinetMenu } = await import('./cabinetHandler.js');
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
            await showMenuKeyboard(ctx, isAdmin);
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
}
