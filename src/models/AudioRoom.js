const { query } = require('../db');

class AudioRoom {
  static async create({ title, description, hostId }) {
    const sql = `
      INSERT INTO audio_rooms (title, description, created_by, status, participants_count)
      VALUES ($1, $2, $3, 'live', 1)
      RETURNING *
    `;
    const result = await query(sql, [title, description || null, hostId]);
    return result.rows[0];
  }

  static async findLive() {
    const sql = `
      SELECT ar.*
      FROM audio_rooms ar
      WHERE ar.status = 'live'
      ORDER BY ar.created_at DESC
      LIMIT 100
    `;
    const result = await query(sql);
    return result.rows;
  }

  static async findById(id) {
    const result = await query('SELECT * FROM audio_rooms WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async join({ roomId, userId, role = 'listener' }) {
    await query(
      `
      INSERT INTO audio_room_participants (room_id, user_id, role, joined_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (room_id, user_id)
      DO UPDATE SET role = EXCLUDED.role, left_at = NULL
      `,
      [roomId, userId, role]
    );

    const room = await query(
      `
      UPDATE audio_rooms
      SET participants_count = (
        SELECT COUNT(*) FROM audio_room_participants
        WHERE room_id = $1 AND left_at IS NULL
      )
      WHERE id = $1
      RETURNING *
      `,
      [roomId]
    );

    return room.rows[0];
  }
 codex/assess-registration-and-login-issues-v0dk1t

  static async leave({ roomId, userId }) {
    await query(
      `
      UPDATE audio_room_participants
      SET left_at = NOW()
      WHERE room_id = $1 AND user_id = $2
      `,
      [roomId, userId]
    );

    const room = await query(
      `
      UPDATE audio_rooms
      SET participants_count = (
        SELECT COUNT(*) FROM audio_room_participants
        WHERE room_id = $1 AND left_at IS NULL
      )
      WHERE id = $1
      RETURNING *
      `,
      [roomId]
    );

    return room.rows[0];
  }

  static async getParticipantRole({ roomId, userId }) {
    const result = await query(
      `
      SELECT role
      FROM audio_room_participants
      WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL
      `,
      [roomId, userId]
    );

    return result.rows[0]?.role || null;
  }
}

module.exports = AudioRoom;

}

module.exports = AudioRoom;

 main
