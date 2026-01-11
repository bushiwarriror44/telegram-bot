import { menuButtonService } from '../../services/menuButtonService.js';
import { isAdmin } from './authHandler.js';

// Режимы работы с кнопками меню
export const menuButtonEditMode = new Map(); // userId -> { mode: 'add'|'edit', id?: number }
export const menuButtonDeleteMode = new Map(); // userId -> true

/**
 * Регистрирует обработчики кнопок меню
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerMenuButtonsHandlers(bot) {
    bot.action('admin_menu_buttons', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showMenuButtonsAdmin(ctx);
    });

    bot.hears('Настройка кнопок', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showMenuButtonsAdmin(ctx);
    });

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
}

/**
 * Показ меню управления кнопками
 */
export async function showMenuButtonsAdmin(ctx) {
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
