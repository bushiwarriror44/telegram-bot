import { cityService } from '../services/cityService.js';
import { districtService } from '../services/districtService.js';
import { productService } from '../services/productService.js';
import { paymentService } from '../services/paymentService.js';
import { packagingService } from '../services/packagingService.js';
import { cardAccountService } from '../services/cardAccountService.js';
import { menuButtonService } from '../services/menuButtonService.js';
import { reviewService } from '../services/reviewService.js';

const mockCities = [
  'Москва',
  'Санкт-Петербург',
  'Новосибирск',
  'Екатеринбург',
  'Казань'
];

export const mockProducts = {
  // Единственный предустановленный товар
  'Москва': [
    {
      name: 'Шишки Amnezia Haze',
      description: '',
      // ВАЖНО: цена и фасовка задаются при размещении товара по районам
      image_path: null
    }
  ]
};

/**
 * Получает все предустановленные товары в виде плоского списка
 */
export function getMockProducts() {
  const allProducts = [];
  for (const cityName in mockProducts) {
    for (const product of mockProducts[cityName]) {
      allProducts.push(product);
    }
  }
  // Убираем дубликаты по названию
  const uniqueProducts = [];
  const seenNames = new Set();
  for (const product of allProducts) {
    if (!seenNames.has(product.name)) {
      uniqueProducts.push(product);
      seenNames.add(product.name);
    }
  }
  return uniqueProducts;
}

/**
 * Удаляет предустановленный товар по имени из всех городов
 */
export function removeMockProduct(productName) {
  let removed = false;
  for (const cityName in mockProducts) {
    const index = mockProducts[cityName].findIndex(p => p.name === productName);
    if (index !== -1) {
      mockProducts[cityName].splice(index, 1);
      removed = true;
    }
  }
  return removed;
}

/**
 * Добавляет предустановленный товар в указанный город (или первый доступный)
 */
export function addMockProduct(product, cityName = null) {
  if (cityName && mockProducts[cityName]) {
    mockProducts[cityName].push(product);
    return true;
  }
  // Если город не указан или не найден, добавляем в первый доступный
  const firstCity = Object.keys(mockProducts)[0];
  if (firstCity) {
    mockProducts[firstCity].push(product);
    return true;
  }
  return false;
}

// Криптовалютные методы оплаты
const paymentMethods = [
  { name: 'BTC', network: 'BTC' },
  { name: 'LTC', network: 'LTC' },
  { name: 'USDT TRC20', network: 'TRC20' }
];

// Карточные методы оплаты
const cardPaymentMethods = [
  { name: 'СБП', network: 'SBP' },
  { name: 'Банковская карта', network: 'CARD' },
  { name: 'Оплата с мобильного', network: 'MOBILE' },
  { name: 'ТРАНСГРАН', network: 'TRANSGRAN' },
  { name: 'Альфа-Альфа', network: 'ALFA' },
  { name: 'Сбер-Сбер', network: 'SBER' },
  { name: 'Озон-озон', network: 'OZON' }
];

// Базовый набор фасовок (все значения в граммах)
// Порядок: сначала граммы, потом килограммы
// Значения хранятся в граммах: 0.25 = 0.25 г, 1000 = 1 кг
const defaultPackagings = [
  0.25,   // 0,25 г
  0.35,   // 0,35 г
  0.5,    // 0,50 г
  1,      // 1 г
  2,      // 2 г
  3,      // 3 г
  5,      // 5 г
  10,     // 10 г
  20,     // 20 г
  50,     // 50 г
  100,    // 100 г
  200,    // 200 г
  250,    // 250 г
  500,    // 500 г
  1000,   // 1 кг (1000 г)
];

// Предустановленные нижние кнопки меню
const defaultMenuButtons = [
  { name: 'Оператор', message: 'Свяжитесь с оператором: @operator' },
  { name: 'Сайт', message: 'Наш сайт: https://example.com' },
  { name: 'Сайт автопродаж', message: 'Сайт автопродаж: https://autosales.example.com' },
  { name: 'Трудоустройство', message: 'Информация о трудоустройстве: @hr' },
  { name: 'Инфо-канал', message: 'Наш информационный канал: @info_channel' }
];

async function initializeDefaultMenuButtons() {
  console.log('[MOCK] Инициализация предустановленных кнопок меню...');

  const existingButtons = await menuButtonService.getAll(false);

  // Начальный order_index — максимум из существующих + 1
  let currentMaxOrder =
    existingButtons.length > 0
      ? Math.max(...existingButtons.map((b) => b.order_index || 0))
      : -1;

  for (const defaultBtn of defaultMenuButtons) {
    const existing = existingButtons.find((b) => b.name === defaultBtn.name);
    if (!existing) {
      currentMaxOrder += 1;
      await menuButtonService.create(
        defaultBtn.name,
        defaultBtn.message,
        currentMaxOrder
      );
      console.log(`[MOCK] Создана кнопка меню: ${defaultBtn.name}`);
      existingButtons.push({
        name: defaultBtn.name,
        message: defaultBtn.message,
        order_index: currentMaxOrder
      });
    } else {
      console.log(`[MOCK] Кнопка меню уже существует: ${defaultBtn.name}`);
    }
  }
}

export async function initializeMockData() {
  console.log('[MOCK] ========== Инициализация моковых данных ==========');

  // Проверяем, есть ли уже данные
  console.log('[MOCK] Проверка существующих городов...');
  const existingCities = await cityService.getAll();
  console.log('[MOCK] Найдено городов:', existingCities.length);

  // Проверяем наличие товаров
  console.log('[MOCK] Проверка существующих товаров...');
  let totalProducts = 0;
  for (const city of existingCities) {
    const cityProducts = await productService.getByCityId(city.id);
    totalProducts += cityProducts.length;
    console.log(`[MOCK] В городе ${city.name} товаров:`, cityProducts.length);
  }
  console.log('[MOCK] Всего товаров:', totalProducts);

  // Если есть и города, и товары - пропускаем создание городов/товаров,
  // но ВСЁ РАВНО инициализируем кнопки меню и отзывы
  if (existingCities.length > 0 && totalProducts > 0) {
    console.log('[MOCK] Данные уже существуют, пропускаем создание городов/товаров');
    await initializeDefaultMenuButtons();

    // Создаем моковые отзывы, если их нет
    await createMockReviews();

    console.log('[MOCK] Моковые данные (кнопки меню) инициализированы при существующей БД');
    return;
  }

  // Если есть города, но нет товаров - создаем только товары
  if (existingCities.length > 0 && totalProducts === 0) {
    console.log('[MOCK] Города есть, но товаров нет. Создаем товары для существующих городов...');

    // Создаем базовые фасовки если их нет
    const packagingList = await packagingService.getAll();
    if (packagingList.length === 0) {
      console.log('[MOCK] Создание базовых фасовок...');
      for (const value of defaultPackagings) {
        await packagingService.getOrCreate(value);
      }
    }
    const packagingListAfter = await packagingService.getAll();
    const packagingByValue = new Map(
      packagingListAfter.map((p) => [p.value, p])
    );

    // Создаем районы для существующих городов, если их нет
    for (const city of existingCities) {
      const districts = await districtService.getByCityId(city.id);
      if (districts.length === 0) {
        console.log(`[MOCK] Создание района "Центральный" для города ${city.name}...`);
        await districtService.create(city.id, 'Центральный');
      }
    }

    // Создаем товары для существующих городов
    for (const city of existingCities) {
      const districts = await districtService.getByCityId(city.id);
      if (districts.length === 0) continue;

      const district = districts[0]; // Используем первый район
      const products = mockProducts[city.name] || [];
      if (products.length > 0) {
        console.log(`[MOCK] Создание товаров для города ${city.name}, района ${district.name}...`);
        const packaging = packagingByValue.get(1);
        for (let j = 0; j < products.length; j++) {
          const product = products[j];
          try {
            // Товары создаются без фото (imagePath = null)
            let imagePath = null;
            // Цена по умолчанию для предустановленных товаров (1000, как было указано ранее)
            const defaultPrice = product.price || 1000;

            await productService.create(
              city.id,
              district.id,
              product.name,
              product.description || '',
              defaultPrice,
              packaging ? packaging.id : null,
              imagePath
            );
            console.log(`[MOCK] Товар создан: ${product.name} для города ${city.name}, района ${district.name}${imagePath ? ' (с фото)' : ''}`);
          } catch (error) {
            console.error(`[MOCK] ОШИБКА при создании товара ${product.name}:`, error);
          }
        }
      }
    }

    // Создаем методы оплаты если их нет
    const existingPayments = await paymentService.getAllMethods(true);
    if (existingPayments.length === 0) {
      console.log('[MOCK] Создание методов оплаты...');
      // Создаем криптовалютные методы
      for (const method of paymentMethods) {
        await paymentService.createMethod(method.name, method.network, 'crypto');
      }
      // Создаем карточные методы
      for (const method of cardPaymentMethods) {
        await paymentService.createMethod(method.name, method.network, 'card');
      }
    } else {
      // Проверяем и создаем недостающие методы оплаты
      console.log('[MOCK] Проверка наличия всех методов оплаты...');
      // Берём имена из таблицы payment_methods (getAllMethods возвращает крипто + card_accounts, но не type='card' из payment_methods)
      const existingNamesFromDb = await paymentService.getAllPaymentMethodNames();
      const existingNamesNormalized = existingNamesFromDb.map(n => n.toLowerCase()).filter(Boolean);

      // Проверяем криптовалютные методы
      for (const method of paymentMethods) {
        const methodNameNormalized = method.name.trim().toLowerCase();
        const methodName = method.name.trim();

        // Проверяем по нормализованному имени
        if (!existingNamesNormalized.includes(methodNameNormalized)) {
          console.log(`[MOCK] Создание недостающего метода оплаты: ${methodName}`);
          try {
            await paymentService.createMethod(methodName, method.network, 'crypto');
            console.log(`[MOCK] ✅ Метод оплаты ${methodName} успешно создан`);
          } catch (error) {
            // Игнорируем ошибки UNIQUE constraint - это значит метод уже существует
            if (error.code === 'SQLITE_CONSTRAINT') {
              console.log(`[MOCK] ⚠️ Метод оплаты ${methodName} уже существует, пропускаем`);
            } else {
              console.error(`[MOCK] ❌ Ошибка при создании метода ${methodName}:`, error.message);
            }
          }
        } else {
          console.log(`[MOCK] ✓ Метод оплаты ${methodName} уже существует`);
        }
      }

      // Проверяем карточные методы
      for (const method of cardPaymentMethods) {
        const methodNameNormalized = method.name.trim().toLowerCase();
        const methodName = method.name.trim();

        // Проверяем по нормализованному имени
        if (!existingNamesNormalized.includes(methodNameNormalized)) {
          console.log(`[MOCK] Создание недостающего метода оплаты: ${methodName}`);
          try {
            await paymentService.createMethod(methodName, method.network, 'card');
            console.log(`[MOCK] ✅ Метод оплаты ${methodName} успешно создан`);
          } catch (error) {
            // Игнорируем ошибки UNIQUE constraint - это значит метод уже существует
            if (error.code === 'SQLITE_CONSTRAINT') {
              console.log(`[MOCK] ⚠️ Метод оплаты ${methodName} уже существует, пропускаем`);
            } else {
              console.error(`[MOCK] ❌ Ошибка при создании метода ${methodName}:`, error.message);
            }
          }
        } else {
          console.log(`[MOCK] ✓ Метод оплаты ${methodName} уже существует`);
        }
      }
    }

    // Создаем карточные счета если их нет
    const existingCards = await cardAccountService.getAll(false);
    if (existingCards.length === 0) {
      console.log('[MOCK] Создание карточных счетов...');
      const mockCardAccounts = [
        { name: 'Альфа-Банк', accountNumber: '5536 9141 2345 6789' },
        { name: 'Т-Банк', accountNumber: '4111 1111 1111 1111' },
        { name: 'СБП', accountNumber: '+7 900 123-45-67' },
        { name: 'Visa', accountNumber: '4532 1234 5678 9010' },
        { name: 'Mastercard', accountNumber: '5555 5555 5555 4444' },
        { name: 'ТРАНСГРАН', accountNumber: '4276 1234 5678 9012' }
      ];
      for (const card of mockCardAccounts) {
        await cardAccountService.create(card.name, card.accountNumber);
      }
    } else {
      // Проверяем и создаем недостающие карточные счета
      console.log('[MOCK] Проверка наличия всех карточных счетов...');
      const existingCardNames = existingCards.map(c => c.name);
      const requiredCards = [
        { name: 'Альфа-Банк', accountNumber: '5536 9141 2345 6789' },
        { name: 'Т-Банк', accountNumber: '4111 1111 1111 1111' },
        { name: 'СБП', accountNumber: '+7 900 123-45-67' },
        { name: 'Visa', accountNumber: '4532 1234 5678 9010' },
        { name: 'Mastercard', accountNumber: '5555 5555 5555 4444' },
        { name: 'ТРАНСГРАН', accountNumber: '4276 1234 5678 9012' }
      ];

      for (const card of requiredCards) {
        if (!existingCardNames.includes(card.name)) {
          console.log(`[MOCK] Создание недостающего карточного счета: ${card.name}`);
          try {
            await cardAccountService.create(card.name, card.accountNumber);
          } catch (error) {
            console.error(`[MOCK] Ошибка при создании карточного счета ${card.name}:`, error);
          }
        }
      }
    }

    console.log('[MOCK] Товары для существующих городов созданы!');

    // Инициализируем кнопки меню и выходим
    await initializeDefaultMenuButtons();
    console.log('[MOCK] Моковые данные (кнопки меню) инициализированы при существующих городах');
    return;
  }

  // Создаем базовые фасовки
  console.log('[MOCK] Создание базовых фасовок...');
  console.log('[MOCK] Количество фасовок для создания:', defaultPackagings.length);
  for (let i = 0; i < defaultPackagings.length; i++) {
    const value = defaultPackagings[i];
    console.log(`[MOCK] Создание фасовки ${i + 1}/${defaultPackagings.length}:`, value);
    try {
      await packagingService.getOrCreate(value);
      console.log(`[MOCK] Фасовка ${value} успешно создана/получена`);
    } catch (error) {
      console.error(`[MOCK] ОШИБКА при создании фасовки ${value}:`, error);
      throw error;
    }
  }
  const packagingList = await packagingService.getAll();
  const packagingByValue = new Map(
    packagingList.map((p) => [p.value, p])
  );

  // Создаем города, районы и товары
  console.log('[MOCK] Создание городов, районов и товаров...');
  console.log('[MOCK] Количество городов для создания:', mockCities.length);
  for (let i = 0; i < mockCities.length; i++) {
    const cityName = mockCities[i];
    console.log(`[MOCK] Создание города ${i + 1}/${mockCities.length}: ${cityName}`);
    try {
      const city = await cityService.create(cityName);
      console.log(`[MOCK] Город создан: ${cityName}, ID:`, city?.id);

      // Создаем район "Центральный" для города
      console.log(`[MOCK] Создание района "Центральный" для города ${cityName}...`);
      const district = await districtService.create(city.id, 'Центральный');
      console.log(`[MOCK] Район создан: ${district.name}, ID:`, district?.id);

      const products = mockProducts[cityName] || [];
      console.log(`[MOCK] Товаров для города ${cityName}:`, products.length);
      for (let j = 0; j < products.length; j++) {
        const product = products[j];
        console.log(`[MOCK] Создание товара ${j + 1}/${products.length}: ${product.name}`);
        // Для примера всем товарам ставим фасовку 1 (можно легко поменять)
        const packaging = packagingByValue.get(1);
        console.log(`[MOCK] Фасовка для товара:`, packaging ? packaging.id : 'null');
        try {
          // Товары создаются без фото (imagePath = null)
          let imagePath = null;
          // Цена по умолчанию для предустановленных товаров (1000, как было указано ранее)
          const defaultPrice = product.price || 1000;

          await productService.create(
            city.id,
            district.id,
            product.name,
            product.description || '',
            defaultPrice,
            packaging ? packaging.id : null,
            imagePath
          );
          console.log(`[MOCK] Товар создан: ${product.name}${imagePath ? ' (с фото)' : ''}`);
        } catch (error) {
          console.error(`[MOCK] ОШИБКА при создании товара ${product.name}:`, error);
          throw error;
        }
      }
    } catch (error) {
      console.error(`[MOCK] ОШИБКА при создании города ${cityName}:`, error);
      throw error;
    }
  }

  // Создаем криптовалютные методы оплаты
  for (const method of paymentMethods) {
    await paymentService.createMethod(method.name, method.network, 'crypto');
    console.log(`Создан метод оплаты: ${method.name} (${method.network})`);
  }

  // Создаем карточные методы оплаты
  for (const method of cardPaymentMethods) {
    await paymentService.createMethod(method.name, method.network, 'card');
    console.log(`Создан метод оплаты: ${method.name} (${method.network})`);
  }

  // Создаем моковые карточные счета
  const mockCardAccounts = [
    { name: 'Альфа-Банк', accountNumber: '5536 9141 2345 6789' },
    { name: 'Т-Банк', accountNumber: '4111 1111 1111 1111' },
    { name: 'СБП', accountNumber: '+7 900 123-45-67' },
    { name: 'Visa', accountNumber: '4532 1234 5678 9010' },
    { name: 'Mastercard', accountNumber: '5555 5555 5555 4444' },
    { name: 'ТРАНСГРАН', accountNumber: '4276 1234 5678 9012' }
  ];

  for (const card of mockCardAccounts) {
    await cardAccountService.create(card.name, card.accountNumber);
    console.log(`Создан карточный счет: ${card.name} - ${card.accountNumber}`);
  }

  // Инициализируем кнопки меню
  await initializeDefaultMenuButtons();

  // Создаем моковые отзывы
  await createMockReviews();

  console.log('Моковые данные успешно инициализированы!');
}

// Функция для создания моковых отзывов
async function createMockReviews() {
  const mockReviews = [
    {
      product_name: 'Магнитогорск / Правый Орджо / 🧲😻Леденцы Мяу Мяу New😻🧲 2г',
      city_name: 'Магнитогорск',
      district_name: 'Правый Орджо',
      rating: 5,
      review_text: 'Все отлично, все на месте\nЗабрал быстро\nТовар классный\nВсем спасибо',
      review_date: '2025-12-30'
    },
    {
      product_name: 'Белорецк / Окраина / 😻Леденцы Мяу Мяу New😻 3г',
      city_name: 'Белорецк',
      district_name: 'Окраина',
      rating: 5,
      review_text: 'Касание',
      review_date: '2025-12-29'
    },
    {
      product_name: 'Учалы / Учалы / 🌶 Spice Mix Vasabi 🌶 3г',
      city_name: 'Учалы',
      district_name: 'Учалы',
      rating: 5,
      review_text: 'От души 🤝',
      review_date: '2025-12-29'
    },
    {
      product_name: 'Учалы / Учалы / 🧲💎 Леденцы Кис Кис 💎🧲 2г',
      city_name: 'Учалы',
      district_name: 'Учалы',
      rating: 5,
      review_text: 'Бро дома от души и душевно респект тебе, а нам чёткие подъёмом',
      review_date: '2025-12-28'
    },
    {
      product_name: 'Магнитогорск / Правый Орджо / 🧲😻Леденцы Мяу Мяу New😻🧲 2г',
      city_name: 'Магнитогорск',
      district_name: 'Правый Орджо',
      rating: 5,
      review_text: 'Все на месте\nПолный анти шкур\nСам еле как забрал, но все четко\nСпасибо 😂🤟🏻',
      review_date: '2025-12-28'
    }
  ];

  // Проверяем, есть ли уже отзывы
  try {
    const existingReviews = await reviewService.getAllReviews();

    if (existingReviews.length === 0) {
      console.log('[MOCK] Создание моковых отзывов...');
      for (const review of mockReviews) {
        try {
          await reviewService.create(
            review.product_name,
            review.city_name,
            review.district_name,
            review.rating,
            review.review_text,
            review.review_date
          );
          console.log(`[MOCK] Создан отзыв: ${review.product_name}`);
        } catch (error) {
          console.error(`[MOCK] Ошибка при создании отзыва ${review.product_name}:`, error);
        }
      }
      console.log(`[MOCK] Создано моковых отзывов: ${mockReviews.length}`);
    } else {
      console.log(`[MOCK] Отзывы уже существуют (${existingReviews.length} шт.), пропускаем создание моковых данных`);
    }
  } catch (error) {
    console.error('Ошибка при проверке/создании отзывов:', error);
  }

  console.log('Моковые данные успешно инициализированы!');
}

// Функция для гарантированного создания ТРАНСГРАН
export async function ensureTransgranExists() {
  console.log('[MOCK] Проверка наличия ТРАНСГРАН...');

  try {
    // Проверяем метод оплаты ТРАНСГРАН
    const allMethods = await paymentService.getAllMethods(true);
    const transgranMethod = allMethods.find(m => m.name === 'ТРАНСГРАН');

    if (!transgranMethod) {
      console.log('[MOCK] Метод оплаты ТРАНСГРАН не найден. Создаю...');
      try {
        await paymentService.createMethod('ТРАНСГРАН', 'TRANSGRAN', 'card');
        console.log('[MOCK] ✅ Метод оплаты ТРАНСГРАН создан!');
      } catch (error) {
        console.error('[MOCK] ❌ Ошибка при создании метода ТРАНСГРАН:', error.message);
      }
    } else {
      console.log('[MOCK] Метод оплаты ТРАНСГРАН найден (ID: ' + transgranMethod.id + ')');
      // Включаем метод, если он отключен
      if (!transgranMethod.enabled) {
        console.log('[MOCK] Метод ТРАНСГРАН отключен. Включаю...');
        await paymentService.enableMethod(transgranMethod.id, true);
        console.log('[MOCK] ✅ Метод ТРАНСГРАН включен!');
      }
    }

    // Проверяем карточный счет ТРАНСГРАН (включая отключенные)
    const transgranCard = await cardAccountService.getByName('ТРАНСГРАН', true);
    if (!transgranCard) {
      console.log('[MOCK] Карточный счет ТРАНСГРАН не найден. Создаю...');
      try {
        await cardAccountService.create('ТРАНСГРАН', '4276 1234 5678 9012');
        console.log('[MOCK] ✅ Карточный счет ТРАНСГРАН создан!');
      } catch (error) {
        console.error('[MOCK] ❌ Ошибка при создании карточного счета ТРАНСГРАН:', error.message);
      }
    } else {
      console.log('[MOCK] Карточный счет ТРАНСГРАН найден (ID: ' + transgranCard.id + ')');
    }

    console.log('[MOCK] Проверка ТРАНСГРАН завершена');
  } catch (error) {
    console.error('[MOCK] ❌ Критическая ошибка при проверке ТРАНСГРАН:', error);
  }
}
