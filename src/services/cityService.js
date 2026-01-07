import { database } from '../database/db.js';

export class CityService {
  async getAll() {
    return await database.all('SELECT * FROM cities ORDER BY name');
  }

  async getById(id) {
    return await database.get('SELECT * FROM cities WHERE id = ?', [id]);
  }

  async create(name) {
    console.log('[CityService.create] Начало создания города, name:', name);
    console.log('[CityService.create] Вызов database.run...');
    const result = await database.run('INSERT INTO cities (name) VALUES (?)', [name]);
    console.log('[CityService.create] database.run вернул результат:', JSON.stringify(result));
    console.log('[CityService.create] Тип result:', typeof result);
    console.log('[CityService.create] result.lastID:', result?.lastID);
    console.log('[CityService.create] result:', result);
    
    if (!result || result.lastID === undefined) {
      console.error('[CityService.create] ОШИБКА: result или result.lastID undefined!');
      console.error('[CityService.create] Полный result:', result);
      throw new Error(`Не удалось получить lastID после INSERT. Result: ${JSON.stringify(result)}`);
    }
    
    const city = { id: result.lastID, name };
    console.log('[CityService.create] Создан город:', JSON.stringify(city));
    return city;
  }

  async update(id, name) {
    await database.run('UPDATE cities SET name = ? WHERE id = ?', [name, id]);
    return await this.getById(id);
  }

  async delete(id) {
    await database.run('DELETE FROM cities WHERE id = ?', [id]);
  }

  async exists(id) {
    const city = await this.getById(id);
    return !!city;
  }
}

export const cityService = new CityService();

