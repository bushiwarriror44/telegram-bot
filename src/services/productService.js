import { database } from '../database/db.js';

export class ProductService {
    async getByDistrictId(districtId) {
        return await database.all(
            `
      SELECT 
        p.*,
        pk.value AS packaging_value
      FROM products p
      LEFT JOIN packagings pk ON pk.id = p.packaging_id
      WHERE p.district_id = ?
      ORDER BY p.name
      `,
            [districtId]
        );
    }

    async getByCityId(cityId) {
        return await database.all(
            `
      SELECT 
        p.*,
        pk.value AS packaging_value
      FROM products p
      LEFT JOIN packagings pk ON pk.id = p.packaging_id
      WHERE p.city_id = ?
      ORDER BY p.name
      `,
            [cityId]
        );
    }

    async getById(id) {
        return await database.get(
            `
      SELECT 
        p.*,
        pk.value AS packaging_value
      FROM products p
      LEFT JOIN packagings pk ON pk.id = p.packaging_id
      WHERE p.id = ?
      `,
            [id]
        );
    }

    async create(cityId, districtId, name, description, price, packagingId, imagePath = null) {
        const result = await database.run(
            'INSERT INTO products (city_id, district_id, name, description, price, packaging_id, image_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [cityId, districtId, name, description, price, packagingId, imagePath]
        );
        return await this.getById(result.lastID);
    }

    async update(id, name, description, price, packagingId, imagePath = null) {
        await database.run(
            'UPDATE products SET name = ?, description = ?, price = ?, packaging_id = ?, image_path = ? WHERE id = ?',
            [name, description, price, packagingId, imagePath, id]
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

    async exists(id) {
        const product = await this.getById(id);
        return !!product;
    }
}

export const productService = new ProductService();

