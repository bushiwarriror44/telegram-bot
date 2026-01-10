import { cityService } from '../services/cityService.js';
import { districtService } from '../services/districtService.js';
import { productService } from '../services/productService.js';
import { paymentService } from '../services/paymentService.js';
import { packagingService } from '../services/packagingService.js';
import { cardAccountService } from '../services/cardAccountService.js';
import { menuButtonService } from '../services/menuButtonService.js';

const mockCities = [
  'Москва',
  'Санкт-Петербург',
  'Новосибирск',
  'Екатеринбург',
  'Казань'
];

const mockProducts = {
  'Москва': [
    { name: 'iPhone 15 Pro', description: 'Новейший смартфон Apple с процессором A17 Pro', price: 89999 },
    { name: 'MacBook Pro M3', description: 'Мощный ноутбук для работы и творчества', price: 199999 },
    { name: 'AirPods Pro 2', description: 'Беспроводные наушники с активным шумоподавлением', price: 24999 }
  ],
  'Санкт-Петербург': [
    { name: 'Samsung Galaxy S24', description: 'Флагманский Android смартфон', price: 79999 },
    { name: 'iPad Air', description: 'Планшет для работы и развлечений', price: 59999 },
    { name: 'Apple Watch Series 9', description: 'Умные часы с множеством функций', price: 39999 }
  ],
  'Новосибирск': [
    { name: 'Xiaomi 14 Pro', description: 'Премиальный смартфон от Xiaomi', price: 69999 },
    { name: 'PlayStation 5', description: 'Игровая консоль нового поколения', price: 49999 },
    { name: 'Nintendo Switch', description: 'Портативная игровая консоль', price: 29999 }
  ],
  'Екатеринбург': [
    { name: 'Google Pixel 8', description: 'Смартфон с лучшей камерой', price: 74999 },
    { name: 'Sony WH-1000XM5', description: 'Наушники с премиальным звуком', price: 34999 },
    { name: 'DJI Mini 4 Pro', description: 'Компактный дрон для съемки', price: 99999 }
  ],
  'Казань': [
    { name: 'OnePlus 12', description: 'Быстрый смартфон с быстрой зарядкой', price: 64999 },
    { name: 'Steam Deck', description: 'Портативная игровая консоль от Valve', price: 44999 },
    { name: 'Meta Quest 3', description: 'VR шлем для виртуальной реальности', price: 59999 }
  ]
};

const paymentMethods = [
  { name: 'Bitcoin', network: 'BTC' },
  { name: 'Ethereum', network: 'ETH' },
  { name: 'Tron', network: 'TRC' },
  { name: 'USDT', network: 'USDT' }
];

// Базовый набор фасовок
const defaultPackagings = [
  0.25,
  0.35,
  0.5,
  1,
  2,
  3,
  4,
  5,
  10,
  15,
  20,
  30,
  40,
  50
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
  // но ВСЁ РАВНО инициализируем кнопки меню
  if (existingCities.length > 0 && totalProducts > 0) {
    console.log('[MOCK] Данные уже существуют, пропускаем создание городов/товаров');
    await initializeDefaultMenuButtons();
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
            // Для первого товара первого города устанавливаем дефолтное изображение
            let imagePath = null;
            const cityIndex = existingCities.findIndex(c => c.id === city.id);
            if (j === 0 && cityIndex === 0) {
              imagePath = 'src/assets/img/placeholder_photo.png';
            }
            
            await productService.create(
              city.id,
              district.id,
              product.name,
              product.description,
              product.price,
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
      for (const method of paymentMethods) {
        await paymentService.createMethod(method.name, method.network, 'crypto');
      }
      await paymentService.createMethod('Карта', 'CARD', 'card');
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
        { name: 'Mastercard', accountNumber: '5555 5555 5555 4444' }
      ];
      for (const card of mockCardAccounts) {
        await cardAccountService.create(card.name, card.accountNumber);
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
          // Для первого товара устанавливаем дефолтное изображение
          let imagePath = null;
          if (j === 0 && i === 0) {
            // Первый товар первого города
            imagePath = 'src/assets/img/placeholder_photo.png';
          }
          
      await productService.create(
        city.id,
        district.id,
        product.name,
        product.description,
        product.price,
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

  // Создаем методы оплаты
  for (const method of paymentMethods) {
    await paymentService.createMethod(method.name, method.network, 'crypto');
    console.log(`Создан метод оплаты: ${method.name} (${method.network})`);
  }

  // Создаем метод оплаты картой
  await paymentService.createMethod('Карта', 'CARD', 'card');
  console.log('Создан метод оплаты: Карта');

  // Создаем моковые карточные счета
  const mockCardAccounts = [
    { name: 'Альфа-Банк', accountNumber: '5536 9141 2345 6789' },
    { name: 'Т-Банк', accountNumber: '4111 1111 1111 1111' },
    { name: 'СБП', accountNumber: '+7 900 123-45-67' },
    { name: 'Visa', accountNumber: '4532 1234 5678 9010' },
    { name: 'Mastercard', accountNumber: '5555 5555 5555 4444' }
  ];

  for (const card of mockCardAccounts) {
    await cardAccountService.create(card.name, card.accountNumber);
    console.log(`Создан карточный счет: ${card.name} - ${card.accountNumber}`);
  }

  // Инициализируем кнопки меню и завершаем
  await initializeDefaultMenuButtons();
  console.log('Моковые данные успешно инициализированы!');
}

