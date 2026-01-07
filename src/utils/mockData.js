import { cityService } from '../services/cityService.js';
import { productService } from '../services/productService.js';
import { paymentService } from '../services/paymentService.js';
import { packagingService } from '../services/packagingService.js';
import { cardAccountService } from '../services/cardAccountService.js';

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

export async function initializeMockData() {
  console.log('Инициализация моковых данных...');

  // Проверяем, есть ли уже данные
  const existingCities = await cityService.getAll();
  if (existingCities.length > 0) {
    console.log('Данные уже существуют, пропускаем инициализацию');
    return;
  }

  // Создаем базовые фасовки
  console.log('Создаем базовые фасовки...');
  for (const value of defaultPackagings) {
    await packagingService.getOrCreate(value);
  }
  const packagingList = await packagingService.getAll();
  const packagingByValue = new Map(
    packagingList.map((p) => [p.value, p])
  );

  // Создаем города и товары
  for (const cityName of mockCities) {
    const city = await cityService.create(cityName);
    console.log(`Создан город: ${cityName}`);

    const products = mockProducts[cityName] || [];
    for (const product of products) {
      // Для примера всем товарам ставим фасовку 1 (можно легко поменять)
      const packaging = packagingByValue.get(1);
      await productService.create(
        city.id,
        product.name,
        product.description,
        product.price,
        packaging ? packaging.id : null
      );
      console.log(`  - Создан товар: ${product.name}`);
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

  console.log('Моковые данные успешно инициализированы!');
}

