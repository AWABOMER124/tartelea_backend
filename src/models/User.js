const { query } = require('../db');
const { toStorageRole } = require('../utils/roles');

class User {
  static async findByEmail(email) {
    const sql = `
      SELECT u.*, COALESCE(array_remove(array_agg(ur.role), NULL), '{}') as roles
      FROM users u 
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      WHERE LOWER(u.email) = LOWER($1)
      GROUP BY u.id
    `;
    const result = await query(sql, [email]);
    return result.rows[0];
  }

  static async findById(id) {
    const sql = `
      SELECT u.id, u.email, u.is_verified, COALESCE(array_remove(array_agg(ur.role), NULL), '{}') as roles
      FROM users u 
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      WHERE u.id = $1
      GROUP BY u.id
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  }

  static async saveResetToken(client, userId, token, expiresAt) {
    const sql = 'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3';
    await client.query(sql, [token, expiresAt, userId]);
  }

  static async saveVerificationCode(client, userId, code) {
    const sql = 'UPDATE users SET verification_code = $1 WHERE id = $2';
    await client.query(sql, [code, userId]);
  }

  static async verifyEmail(client, userId) {
    const sql = 'UPDATE users SET is_verified = TRUE, verification_code = NULL WHERE id = $1';
    await client.query(sql, [userId]);
  }

  static async findByVerificationCode(code) {
    const sql = `
      SELECT u.id, u.email, u.is_verified, COALESCE(array_remove(array_agg(ur.role), NULL), '{}') as roles
      FROM users u 
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      WHERE u.verification_code = $1
      GROUP BY u.id
    `;
    const result = await query(sql, [code]);
    return result.rows[0];
  }

  static async findByResetToken(token) {
    const sql = `
      SELECT u.id, u.email, u.reset_token_expires, COALESCE(array_remove(array_agg(ur.role), NULL), '{}') as roles
      FROM users u 
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      WHERE u.reset_token = $1
      GROUP BY u.id
    `;
    const result = await query(sql, [token]);
    return result.rows[0];
  }

  static async updatePassword(client, userId, passwordHash) {
    const sql = 'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2';
    await client.query(sql, [passwordHash, userId]);
  }

  static async create(client, email, passwordHash) {
    const sql = 'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email';
    try {
      const result = await client.query(sql, [email, passwordHash]);
      return result.rows[0];
    } catch (err) {
      if (err.code === '23505') { // PostgreSQL unique violation code
        throw new Error('Email already registered');
      }
      throw err;
    }
  }

  static async assignRole(client, userId, role) {
    const storageRole = toStorageRole(role);
    if (!storageRole) {
      return;
    }

    const sql = 'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING';
    await client.query(sql, [userId, storageRole]);
  }
}

module.exports = User;
