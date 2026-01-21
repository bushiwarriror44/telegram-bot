import { config } from '../../config/index.js';
import { productService } from '../../services/productService.js';
import { districtService } from '../../services/districtService.js';
import { settingsService } from '../../services/settingsService.js';
import { reviewService } from '../../services/reviewService.js';
import { database } from '../../database/db.js';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { isAdmin } from './authHandler.js';
import { productImageUploadMode, predefinedProductImageUploadMode } from './productsHandler.js';
import { reviewImportMode, showReviewsAdmin } from './reviewsHandler.js';
import { databaseImportMode, showDataMenu } from './dataHandler.js';
import { channelBindMode } from './panelHandler.js';
import { settingsService as settingsServiceForChannel } from '../../services/settingsService.js';
import { formatPackaging } from '../../utils/packagingHelper.js';
import { getMockProducts } from '../../utils/mockData.js';

/**
 * Регистрирует обработчики медиа (фото и документы)
 * @param {Object} bot - Экземпляр Telegraf бота
 */
export function registerMediaHandlers(bot) {
    // Обработка загрузки фото для товаров
    bot.on('photo', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;

        if (productImageUploadMode.has(ctx.from.id)) {
            try {
                const productId = productImageUploadMode.get(ctx.from.id);
                const product = await productService.getById(productId);

                if (!product) {
                    await ctx.reply('Товар не найден.');
                    productImageUploadMode.delete(ctx.from.id);
                    return;
                }

                // Получаем фото наибольшего размера
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const file = await bot.telegram.getFile(photo.file_id);
                const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

                // Создаем директорию для изображений товаров, если её нет
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = dirname(__filename);
                // projectRoot: .../telegram-bot (нужно, чтобы совпадало с поиском в user/catalogHandler.js)
                const projectRoot = join(__dirname, '../../..');
                const imagesDir = join(projectRoot, 'src/assets/products');
                if (!existsSync(imagesDir)) {
                    mkdirSync(imagesDir, { recursive: true });
                }

                // Скачиваем и сохраняем изображение
                const response = await fetch(fileUrl);
                const buffer = await response.arrayBuffer();
                const imagePath = join(imagesDir, `product_${productId}_${Date.now()}.jpg`);
                writeFileSync(imagePath, Buffer.from(buffer));

                // Сохраняем относительный путь в БД
                const relativePath = `src/assets/products/${basename(imagePath)}`;
                console.log('[AdminMediaHandler] Product photo saved:', {
                    productId,
                    projectRoot,
                    imagesDir,
                    imagePath,
                    relativePath,
                    exists: existsSync(imagePath)
                });
                await productService.updateImage(productId, relativePath);

                productImageUploadMode.delete(ctx.from.id);
                await ctx.reply(
                    '✅ <b>Изображение товара успешно загружено!</b>\n\n' +
                    `📷 Изображение для товара "${product.name}" сохранено и будет отображаться при просмотре товара пользователями.\n\n` +
                    `Вы можете загрузить другое изображение, нажав на кнопку "📷 Загрузить/Изменить фото" ниже.`,
                    { parse_mode: 'HTML' }
                );

                // Показываем меню редактирования товара
                const district = await districtService.getById(product.district_id);
                const currencySymbol = await settingsService.getCurrencySymbol();
                await ctx.reply(
                    `✏️ <b>Редактирование товара: ${product.name}</b>\n\n` +
                    `Текущие данные:\n` +
                    `• Название: ${product.name}\n` +
                    `• Описание: ${product.description || 'Отсутствует'}\n` +
                    `• Цена: ${product.price} ${currencySymbol}\n` +
                    `• Фасовка: ${formatPackaging(product.packaging_value)}\n` +
                    `• Фото: ✅ Загружено\n\n` +
                    `Выберите действие:`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📷 Загрузить/Изменить фото', callback_data: `admin_product_upload_photo_${product.id}` }],
                                [{ text: '🏷️ Изменить фасовку', callback_data: `admin_product_edit_packaging_${product.id}` }],
                                [{ text: '◀️ Назад к товарам', callback_data: `admin_products_district_${product.district_id}` }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при загрузке фото товара:', error);
                await ctx.reply('❌ Ошибка при загрузке фото: ' + error.message);
                productImageUploadMode.delete(ctx.from.id);
            }
            return;
        }

        // Загрузка фото для предустановленного товара (шаблона)
        if (predefinedProductImageUploadMode.has(ctx.from.id)) {
            try {
                const index = predefinedProductImageUploadMode.get(ctx.from.id);
                const products = getMockProducts();

                if (index < 0 || index >= products.length) {
                    await ctx.reply('❌ Предустановленный товар не найден.');
                    predefinedProductImageUploadMode.delete(ctx.from.id);
                    return;
                }

                const template = products[index];

                // Получаем фото наибольшего размера
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const file = await bot.telegram.getFile(photo.file_id);
                const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

                // Создаем директорию для изображений, если её нет
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = dirname(__filename);
                const projectRoot = join(__dirname, '../../..');
                const imagesDir = join(projectRoot, 'src/assets/products');
                if (!existsSync(imagesDir)) {
                    mkdirSync(imagesDir, { recursive: true });
                }

                // Скачиваем и сохраняем изображение
                const response = await fetch(fileUrl);
                const buffer = await response.arrayBuffer();
                const imagePath = join(imagesDir, `predefined_${index}_${Date.now()}.jpg`);
                writeFileSync(imagePath, Buffer.from(buffer));

                // Сохраняем относительный путь в шаблоне
                const relativePath = `src/assets/products/${basename(imagePath)}`;
                template.image_path = relativePath;
                console.log('[AdminMediaHandler] Predefined photo saved:', {
                    index,
                    templateName: template.name,
                    projectRoot,
                    imagesDir,
                    imagePath,
                    relativePath,
                    exists: existsSync(imagePath)
                });

                // Применяем изображение ко всем уже созданным товарам с таким названием
                await productService.updateImageByName(template.name, relativePath);

                predefinedProductImageUploadMode.delete(ctx.from.id);

                await ctx.reply(
                    '✅ <b>Изображение предустановленного товара успешно загружено!</b>\n\n' +
                    `📷 Фото будет использоваться для всех товаров, созданных из шаблона "${template.name}".`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при загрузке фото предустановленного товара:', error);
                await ctx.reply('❌ Ошибка при загрузке фото предустановленного товара: ' + error.message);
                predefinedProductImageUploadMode.delete(ctx.from.id);
            }
            return;
        }

        // Обработка загрузки отзывов (JSON файлы могут быть отправлены как документы)
        // Эта логика обрабатывается в bot.on('document')
    });

    // Обработка загрузки документов (SQL файлов БД и JSON файлов отзывов)
    bot.on('document', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;

        // Обработка загрузки отзывов
        if (reviewImportMode.has(ctx.from.id)) {
            try {
                const document = ctx.message.document;

                // Проверяем, что это JSON файл
                if (!document.file_name || !document.file_name.endsWith('.json')) {
                    await ctx.reply('❌ Ошибка: Файл должен иметь расширение .json');
                    return;
                }

                await ctx.reply('📥 Загрузка JSON файла с отзывами...');

                // Получаем файл
                const file = await bot.telegram.getFile(document.file_id);
                const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

                // Скачиваем файл
                const response = await fetch(fileUrl);
                const jsonText = await response.text();
                const data = JSON.parse(jsonText);

                if (!Array.isArray(data)) {
                    await ctx.reply('❌ Ошибка: JSON должен быть массивом объектов.');
                    return;
                }

                // Импортируем отзывы
                const count = await reviewService.importReviews(data);
                reviewImportMode.delete(ctx.from.id);
                await ctx.reply(`✅ Успешно загружено ${count} отзывов!`);
                await showReviewsAdmin(ctx);
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при загрузке отзывов:', error);
                await ctx.reply('❌ Ошибка при загрузке отзывов: ' + error.message);
                reviewImportMode.delete(ctx.from.id);
            }
            return;
        }

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

    // Обработка пересланных сообщений для привязки канала
    bot.on('message', async (ctx, next) => {
        if (!isAdmin(ctx.from.id)) {
            return next();
        }

        if (channelBindMode.has(ctx.from.id) && ctx.message.forward_from_chat) {
            try {
                const chat = ctx.message.forward_from_chat;
                if (chat.type === 'channel') {
                    const channelId = chat.id.toString();

                    // Сохраняем ID канала
                    await settingsServiceForChannel.setNotificationChannelId(channelId);
                    channelBindMode.delete(ctx.from.id);

                    // Проверяем, что бот может отправлять сообщения в канал
                    try {
                        await bot.telegram.sendMessage(channelId, '✅ Канал успешно привязан! Уведомления будут приходить сюда.');
                        await ctx.reply(`✅ Канал успешно привязан!\n\nID канала: <code>${channelId}</code>`, {
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
                                ]
                            }
                        });
                    } catch (error) {
                        console.error('[AdminHandlers] Ошибка при проверке доступа к каналу:', error);
                        await ctx.reply(
                            `⚠️ Канал привязан, но бот не может отправлять сообщения.\n\n` +
                            `Убедитесь, что бот добавлен в канал как администратор.\n\n` +
                            `ID канала: <code>${channelId}</code>`,
                            {
                                parse_mode: 'HTML',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '◀️ Назад', callback_data: 'admin_panel' }]
                                    ]
                                }
                            }
                        );
                    }
                    return;
                }
            } catch (error) {
                console.error('[AdminHandlers] Ошибка при привязке канала через пересылку:', error);
            }
        }
        return next();
    });
}
