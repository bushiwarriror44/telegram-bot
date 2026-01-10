import { database } from '../database/db.js';

export class DistrictService {
  async getAll() {
    return await database.all('SELECT * FROM districts ORDER BY city_id, name');
  }

  async getByCityId(cityId) {
    return await database.all('SELECT * FROM districts WHERE city_id = ? ORDER BY name', [cityId]);
  }

  async getById(id) {
    return await database.get('SELECT * FROM districts WHERE id = ?', [id]);
  }

  async create(cityId, name) {
    const result = await database.run('INSERT INTO districts (city_id, name) VALUES (?, ?)', [cityId, name]);
    return await this.getById(result.lastID);
  }

  async update(id, name) {
    await database.run('UPDATE districts SET name = ? WHERE id = ?', [name, id]);
    return await this.getById(id);
  }

  async delete(id) {
    await database.run('DELETE FROM districts WHERE id = ?', [id]);
  }

  async exists(id) {
    const district = await this.getById(id);
    return !!district;
  }
}

export const districtService = new DistrictService();
