import { database } from '../database/db.js';

export class MenuButtonService {
  async getAll(enabledOnly = false) {
    const query = enabledOnly
      ? 'SELECT * FROM menu_buttons WHERE enabled = 1 ORDER BY order_index ASC, id ASC'
      : 'SELECT * FROM menu_buttons ORDER BY order_index ASC, id ASC';
    return await database.all(query);
  }

  async getById(id) {
    return await database.get('SELECT * FROM menu_buttons WHERE id = ?', [id]);
  }

  async create(name, message, orderIndex = 0) {
    const result = await database.run(
      'INSERT INTO menu_buttons (name, message, order_index) VALUES (?, ?, ?)',
      [name, message, orderIndex]
    );
    return { id: result.lastID, name, message, order_index: orderIndex, enabled: 1 };
  }

  async update(id, data) {
    const updates = [];
    const params = [];
    
    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.message !== undefined) {
      updates.push('message = ?');
      params.push(data.message);
    }
    if (data.order_index !== undefined) {
      updates.push('order_index = ?');
      params.push(data.order_index);
    }
    if (data.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(data.enabled ? 1 : 0);
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    await database.run(
      `UPDATE menu_buttons SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return await this.getById(id);
  }

  async delete(id) {
    await database.run('DELETE FROM menu_buttons WHERE id = ?', [id]);
  }

  async enable(id, enabled = true) {
    await database.run('UPDATE menu_buttons SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [enabled ? 1 : 0, id]);
    return await this.getById(id);
  }

  async getByName(name) {
    return await database.get('SELECT * FROM menu_buttons WHERE name = ?', [name]);
  }
}

export const menuButtonService = new MenuButtonService();
