import { database } from '../database/db.js';

export class PackagingService {
  async getAll() {
    return await database.all(
      'SELECT * FROM packagings ORDER BY value'
    );
  }

  async getById(id) {
    return await database.get(
      'SELECT * FROM packagings WHERE id = ?',
      [id]
    );
  }

  async getByValue(value) {
    // Обратная совместимость: ищем фасовку в граммах
    return await database.get(
      'SELECT * FROM packagings WHERE value = ? AND (unit = ? OR unit IS NULL)',
      [value, 'g']
    );
  }

  async getByValueAndUnit(value, unit = 'g') {
    const u = unit || 'g';
    return await database.get(
      'SELECT * FROM packagings WHERE value = ? AND unit = ?',
      [value, u]
    );
  }

  async create(value, unit = 'g') {
    console.log('[PackagingService.create] Начало создания фасовки, value:', value, 'unit:', unit);
    console.log('[PackagingService.create] Вызов database.run...');
    const result = await database.run(
      'INSERT INTO packagings (value, unit) VALUES (?, ?)',
      [value, unit || 'g']
    );
    console.log('[PackagingService.create] database.run вернул результат:', JSON.stringify(result));
    console.log('[PackagingService.create] Тип result:', typeof result);
    console.log('[PackagingService.create] result.lastID:', result?.lastID);
    console.log('[PackagingService.create] result:', result);

    if (!result || result.lastID === undefined) {
      console.error('[PackagingService.create] ОШИБКА: result или result.lastID undefined!');
      console.error('[PackagingService.create] Полный result:', result);
      throw new Error(`Не удалось получить lastID после INSERT. Result: ${JSON.stringify(result)}`);
    }

    console.log('[PackagingService.create] Получение созданной записи по ID:', result.lastID);
    const created = await this.getById(result.lastID);
    console.log('[PackagingService.create] Созданная запись:', JSON.stringify(created));
    return created;
  }

  async getOrCreate(value, unit = 'g') {
    console.log('[PackagingService.getOrCreate] Поиск фасовки, value:', value, 'unit:', unit);
    const u = unit || 'g';
    const existing = await this.getByValueAndUnit(value, u);
    console.log('[PackagingService.getOrCreate] Найдена существующая:', existing ? 'да' : 'нет');
    if (existing) {
      console.log('[PackagingService.getOrCreate] Возвращаем существующую:', existing.id);
      return existing;
    }
    console.log('[PackagingService.getOrCreate] Создаем новую фасовку...');
    return await this.create(value);
  }
}

export const packagingService = new PackagingService();


