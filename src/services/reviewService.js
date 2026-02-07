import { database } from '../database/db.js';

export class ReviewService {
    /**
     * Создает новый отзыв
     */
    async create(productName, cityName, districtName, rating, reviewText, reviewDate) {
        const result = await database.run(
            `INSERT INTO reviews (product_name, city_name, district_name, rating, review_text, review_date)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [productName, cityName, districtName, rating, reviewText, reviewDate]
        );
        return await this.getById(result.lastID);
    }

    /**
     * Получает отзыв по ID
     */
    async getById(id) {
        return await database.get('SELECT * FROM reviews WHERE id = ?', [id]);
    }

    /**
     * Получает все отзывы с пагинацией
     */
    async getAll(page = 1, limit = 5) {
        const offset = (page - 1) * limit;
        const reviews = await database.all(
            'SELECT * FROM reviews ORDER BY review_date DESC, id DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
        const totalResult = await database.get('SELECT COUNT(*) as count FROM reviews');
        const total = totalResult?.count || 0;
        const totalPages = Math.ceil(total / limit);
        
        return {
            reviews,
            currentPage: page,
            totalPages,
            total
        };
    }

    /**
     * Получает все отзывы
     */
    async getAllReviews() {
        return await database.all('SELECT * FROM reviews ORDER BY review_date DESC, id DESC');
    }

    /**
     * Удаляет отзыв по ID
     */
    async delete(id) {
        await database.run('DELETE FROM reviews WHERE id = ?', [id]);
    }

    /**
     * Удаляет все отзывы
     */
    async deleteAll() {
        await database.run('DELETE FROM reviews');
    }

    /**
     * Удаляет сгенерированные отзывы: за текущий месяц с датой не позже сегодня (локальная дата).
     * @returns {Promise<number>} количество удалённых записей (changes)
     */
    async deleteGeneratedReviews() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const firstOfMonth = `${year}-${month}-01`;
        const today = `${year}-${month}-${day}`;
        const result = await database.run(
            `DELETE FROM reviews WHERE date(review_date) >= ? AND date(review_date) <= ?`,
            [firstOfMonth, today]
        );
        return result?.changes ?? 0;
    }

    /**
     * Импортирует отзывы из массива
     */
    async importReviews(reviewsArray) {
        // Удаляем все существующие отзывы
        await this.deleteAll();
        
        // Создаем новые отзывы
        for (const review of reviewsArray) {
            await this.create(
                review.product_name,
                review.city_name,
                review.district_name,
                review.rating,
                review.review_text,
                review.review_date
            );
        }
        
        return reviewsArray.length;
    }
}

export const reviewService = new ReviewService();
