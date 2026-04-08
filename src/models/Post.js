const { query } = require('../db');

class Post {
  static async findAll({ limit = 20, offset = 0 } = {}) {
    const sql = `
      SELECT p.*, pr.full_name as author_name 
      FROM posts p 
      LEFT JOIN profiles pr ON p.author_id = pr.id 
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const result = await query(sql, [limit, offset]);
    return result.rows;
  }

  static async findById(id) {
    const sql = `
      SELECT p.*, pr.full_name as author_name 
      FROM posts p 
      LEFT JOIN profiles pr ON p.author_id = pr.id 
      WHERE p.id = $1
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  }

  static async create(authorId, data) {
    const { title, body, category = 'general', image_url } = data;
    const sql = `
      INSERT INTO posts (author_id, title, body, category, image_url) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
    const result = await query(sql, [authorId, title, body, category, image_url]);
    return result.rows[0];
  }

  static async like(id) {
    const sql = 'UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1 RETURNING likes_count';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }
}

module.exports = Post;
