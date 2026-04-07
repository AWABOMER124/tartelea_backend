const { query } = require('../db');

class Workshop {
  static async findAll() {
    const result = await query('SELECT * FROM workshops ORDER BY scheduled_at ASC');
    return result.rows;
  }
}

module.exports = Workshop;
