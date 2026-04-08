const { query } = require('../db');

class Comment {
  static async findByPostId(postId) {
    const sql = `
      SELECT c.*, pr.full_name as author_name 
      FROM comments c 
      LEFT JOIN profiles pr ON c.author_id = pr.id 
      WHERE c.post_id = $1 
      ORDER BY c.created_at ASC
    `;
    const result = await query(sql, [postId]);
    return result.rows;
  }

  static async create(postId, authorId, body) {
    const sql = `
      INSERT INTO comments (post_id, author_id, body) 
      VALUES ($1, $2, $3) 
      RETURNING *
    `;
    const result = await query(sql, [postId, authorId, body]);
    return result.rows[0];
  }
}

module.exports = Comment;
