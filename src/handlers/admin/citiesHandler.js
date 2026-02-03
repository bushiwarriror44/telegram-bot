import { cityService } from '../../services/cityService.js';
import { districtService } from '../../services/districtService.js';
import { productService } from '../../services/productService.js';
import { isAdmin } from './authHandler.js';

// Режимы редактирования
export const districtAddMode = new Map(); // userId -> cityId
export const districtEditMode = new Map(); // userId -> { cityId, districtId }

/**
 * Регистрирует обработчики управления городами и районами
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerCitiesHandlers(bot) {
    bot.action('admin_cities', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCitiesAdmin(ctx);
    });

    bot.hears('Управление городами', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await showCitiesAdmin(ctx);
    });

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

    bot.action(/^admin_districts_city_(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        const cityId = parseInt(ctx.match[1]);
        await showDistrictsForCity(ctx, cityId);
    });

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
            const deletedProducts = await productService.deleteByDistrictId(districtId);
            console.log(`[DistrictDelete] Район id=${districtId} "${district.name}": удалено товаров в районе: ${deletedProducts}`);
            await districtService.delete(districtId);
            console.log(`[DistrictDelete] Район id=${districtId} "${district.name}" успешно удалён`);
            await ctx.editMessageText('✅ Район успешно удален!');
            await showDistrictsForCity(ctx, district.city_id);
        } catch (error) {
            console.error('[DistrictDelete] Ошибка при удалении района:', districtId, error);
            await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
        }
    });
}

/**
 * Показ меню управления городами
 */
export async function showCitiesAdmin(ctx) {
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

/**
 * Показ меню управления районами
 */
export async function showDistrictsAdmin(ctx) {
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

/**
 * Показ районов для города
 */
export async function showDistrictsForCity(ctx, cityId) {
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
