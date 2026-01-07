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
    return await database.get(
      'SELECT * FROM packagings WHERE value = ?',
      [value]
    );
  }

  async create(value) {
    const result = await database.run(
      'INSERT INTO packagings (value) VALUES (?)',
      [value]
    );
    return await this.getById(result.lastID);
  }

  async getOrCreate(value) {
    const existing = await this.getByValue(value);
    if (existing) return existing;
    return await this.create(value);
  }
}

export const packagingService = new PackagingService();


