const { query } = require('../db');

class Subscription {
  static async findByUserId(userId) {
    const sql = 'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1';
    const result = await query(sql, [userId]);
    return result.rows[0] || null;
  }
}

module.exports = Subscription;
