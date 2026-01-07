import { database } from '../database/db.js';

export class CityService {
  async getAll() {
    return await database.all('SELECT * FROM cities ORDER BY name');
  }

  async getById(id) {
    return await database.get('SELECT * FROM cities WHERE id = ?', [id]);
  }

  async create(name) {
    const result = await database.run('INSERT INTO cities (name) VALUES (?)', [name]);
    return { id: result.lastID, name };
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

