import { menuButtonService } from '../services/menuButtonService.js';
import { reviewService } from '../services/reviewService.js';

/**
 * Получает reply keyboard с кнопками главного меню
 * @returns {Promise<Object>} Объект с клавиатурой для reply_markup
 */
export async function getMenuKeyboard() {
    // Получаем количество отзывов
    const reviews = await reviewService.getAllReviews();
    const reviewsCount = reviews.length;
    const reviewsButtonText = reviewsCount > 0 ? `📨 Отзывы (${reviewsCount})` : '📨 Отзывы';

    const topButtons = [
        ['♻️ Каталог', '⚙️ Мой кабинет'],
        [reviewsButtonText]
    ];

    // Получаем динамические кнопки из БД
    const menuButtons = await menuButtonService.getAll(true);

    // Группируем динамические кнопки по 2 в ряд (50% ширины каждая)
    const dynamicButtons = [];
    for (let i = 0; i < menuButtons.length; i += 2) {
        const row = menuButtons.slice(i, i + 2).map(btn => btn.name);
        dynamicButtons.push(row);
    }

    // Объединяем верхние кнопки и динамические
    const keyboard = [...topButtons, ...dynamicButtons];

    return {
        keyboard: keyboard,
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

/**
 * Показывает reply keyboard с главным меню (скрывает для админов)
 * @param {Object} ctx - Контекст Telegraf
 * @param {Function} isAdminFn - Функция для проверки, является ли пользователь админом
 */
export async function showMenuKeyboard(ctx, isAdminFn) {
    // Если пользователь админ, не показываем кнопки меню
    if (isAdminFn && isAdminFn(ctx.from.id)) {
        return;
    }

    const keyboard = await getMenuKeyboard();
    await ctx.reply('🕹 Главное меню:', {
        reply_markup: keyboard
    });
}

/**
 * Получает reply keyboard с кнопками админ-панели
 * @returns {Object} Объект с клавиатурой для reply_markup
 */
export function getAdminMenuKeyboard() {
    const keyboard = [
        ['Управление городами', 'Управление товарами'],
        ['Управление фасовками', 'Управление методами оплаты'],
        ['Управление карточными счетами', 'Чаты'],
        ['Создать уведомление', 'Данные'],
        ['Статистика'],
        ['Настройка приветственного сообщения', 'Настройка кнопок'],
        ['Настройка иконок', 'Бонусы и промокоды'],
        ['Настройка реферальной системы'],
        ['Выход из админ-панели']
    ];

    return {
        keyboard: keyboard,
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

/**
 * Показывает reply keyboard с кнопками админ-панели
 * @param {Object} ctx - Контекст Telegraf
 */
export async function showAdminMenuKeyboard(ctx) {
    const keyboard = getAdminMenuKeyboard();
    await ctx.reply('Кнопки меню изменены согласно роли администратора', {
        reply_markup: keyboard
    });
}
