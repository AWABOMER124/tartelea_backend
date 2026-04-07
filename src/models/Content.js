const { query } = require('../db');

class Content {
  static async findAll(filters = {}) {
    const { category, type } = filters;
    let sql = 'SELECT * FROM contents';
    const params = [];

    if (category || type) {
      sql += ' WHERE';
      if (category) {
        params.push(category);
        sql += ` category = $${params.length}`;
      }
      if (type) {
        if (params.length > 0) sql += ' AND';
        params.push(type);
        sql += ` type = $${params.length}`;
      }
    }

    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    return result.rows;
  }

  static async findById(id) {
    const sql = 'SELECT * FROM contents WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rows[0];
  }
}

module.exports = Content;
