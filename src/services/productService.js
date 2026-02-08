import { database } from '../database/db.js';
import { getOrdersByUser } from '../utils/dataHelpers.js';
import { formatOrderDate } from '../utils/textFormatters.js';

export class ProductService {
    async getByDistrictId(districtId) {
        return await database.all(
            `
      SELECT 
        p.*,
        pk.value AS packaging_value,
        pk.unit AS packaging_unit
      FROM products p
      LEFT JOIN packagings pk ON pk.id = p.packaging_id
      WHERE p.district_id = ?
      ORDER BY p.id
      `,
            [districtId]
        );
    }

    async getByCityId(cityId) {
        return await database.all(
            `
      SELECT 
        p.*,
        pk.value AS packaging_value,
        pk.unit AS packaging_unit
      FROM products p
      LEFT JOIN packagings pk ON pk.id = p.packaging_id
      WHERE p.city_id = ?
      ORDER BY p.id
      `,
            [cityId]
        );
    }

    async getById(id) {
        return await database.get(
            `
      SELECT 
        p.*,
        pk.value AS packaging_value,
        pk.unit AS packaging_unit
      FROM products p
      LEFT JOIN packagings pk ON pk.id = p.packaging_id
      WHERE p.id = ?
      `,
            [id]
        );
    }

    async create(cityId, districtId, name, description, price, packagingId, imagePath = null, packagingLabel = null) {
        const result = await database.run(
            'INSERT INTO products (city_id, district_id, name, description, price, packaging_id, image_path, packaging_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [cityId, districtId, name, description, price, packagingId, imagePath, packagingLabel]
        );
        return await this.getById(result.lastID);
    }

    async update(id, name, description, price, packagingId, imagePath = null, packagingLabel = null) {
        await database.run(
            'UPDATE products SET name = ?, description = ?, price = ?, packaging_id = ?, image_path = ?, packaging_label = ? WHERE id = ?',
            [name, description, price, packagingId, imagePath, packagingLabel, id]
        );
        return await this.getById(id);
    }

    async updateImage(id, imagePath) {
        await database.run(
            'UPDATE products SET image_path = ? WHERE id = ?',
            [imagePath, id]
        );
        return await this.getById(id);
    }

    // Обновляет изображение для всех товаров с указанным названием
    async updateImageByName(name, imagePath) {
        await database.run(
            'UPDATE products SET image_path = ? WHERE name = ?',
            [imagePath, name]
        );
    }

    async delete(id) {
        await database.run('DELETE FROM products WHERE id = ?', [id]);
    }

    /** Удаляет все товары с указанным названием (размещённые в разных районах) */
    async deleteByName(name) {
        const rows = await database.all('SELECT id, district_id FROM products WHERE name = ?', [name]);
        for (const row of rows) {
            await database.run('DELETE FROM products WHERE id = ?', [row.id]);
        }
        return rows.length;
    }

    /** Удаляет все товары в указанном районе. Возвращает количество удалённых. */
    async deleteByDistrictId(districtId) {
        const rows = await database.all('SELECT id FROM products WHERE district_id = ?', [districtId]);
        for (const row of rows) {
            await database.run('DELETE FROM products WHERE id = ?', [row.id]);
        }
        return rows.length;
    }

    async exists(id) {
        const product = await this.getById(id);
        return !!product;
    }

    /** Список товаров с городом, районом, фасовкой и иконкой (для генерации отзывов) */
    async getProductsWithPlaceNames() {
        return await database.all(
            `SELECT 
               p.name AS product_name,
               p.packaging_label,
               c.name AS city_name,
               d.name AS district_name,
               pk.value AS packaging_value,
               pk.unit AS packaging_unit
             FROM products p
             JOIN cities c ON p.city_id = c.id
             JOIN districts d ON p.district_id = d.id
             LEFT JOIN packagings pk ON p.packaging_id = pk.id
             ORDER BY p.id`
        );
    }
}

export const productService = new ProductService();
/**
 * Показ списка заказов
 */

export async function showMyOrders(ctx) {
    try {
        const orders = await getOrdersByUser(ctx.from.id);

        if (orders.length === 0) {
            const text = `📄 Список заказов:\n\nУ вас пока нет заказов.`;

            if (ctx.callbackQuery) {
                try {
                    await ctx.answerCbQuery();
                    await ctx.editMessageText(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                } catch (error) {
                    await ctx.reply(text, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                            ]
                        }
                    });
                }
            } else {
                await ctx.reply(text, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Назад', callback_data: 'cabinet_menu' }]
                        ]
                    }
                });
            }
            return;
        }

        // Собираем все кнопки заказов
        const orderButtons = [];
        for (const order of orders) {
            const formattedDate = formatOrderDate(order.created_at);

            const orderText = `Заказ #95${order.order_number ?? order.id}73 | ${formattedDate}`;

           
            const isCancelledOrUnpaid = order.status === 'cancelled' ||
                order.status === 'pending' ||
                (order.status !== 'completed' && order.status !== 'paid');

            // Красная кнопка для неоплаченных/отмененных, зеленая для оплаченных
            const buttonText = isCancelledOrUnpaid
                ? `🔴 ${orderText}`
                : `🟢 ${orderText}`;

            // Каждая кнопка на отдельной строке (100% ширины)
            orderButtons.push([{
                text: buttonText,
                callback_data: `view_order_${order.id}`
            }]);
        }

        // Отправляем заголовок со всеми кнопками
        const headerText = `📄 Список заказов:`;

        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText(headerText, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: orderButtons
                    }
                });
            } catch (error) {
                await ctx.reply(headerText, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: orderButtons
                    }
                });
            }
        } else {
            await ctx.reply(headerText, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: orderButtons
                }
            });
        }
    } catch (error) {
        console.error('[CabinetHandler] ОШИБКА в showMyOrders:', error);
        if (ctx.callbackQuery) {
            try {
                await ctx.answerCbQuery();
                await ctx.editMessageText('Произошла ошибка. Попробуйте позже.');
            } catch (e) {
                await ctx.reply('Произошла ошибка. Попробуйте позже.');
            }
        } else {
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    }
}

