const { query } = require('../db');

class Profile {
  static async findById(id) {
    const sql = `
      SELECT p.*, array_agg(ur.role) as roles 
      FROM profiles p 
      LEFT JOIN user_roles ur ON p.id = ur.user_id 
      WHERE p.id = $1
      GROUP BY p.id
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  }

  static async create(client, userId, email, fullName, avatarUrl = null, country = null) {
    const sql = `
      INSERT INTO profiles (id, email, full_name, avatar_url, country) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
    const result = await client.query(sql, [userId, email, fullName, avatarUrl, country]);
    return result.rows[0];
  }

  static async update(id, data) {
    const fields = [];
    const values = [];
    let i = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const sql = `UPDATE profiles SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`;
    const result = await query(sql, values);
    return result.rows[0];
  }
}

module.exports = Profile;
