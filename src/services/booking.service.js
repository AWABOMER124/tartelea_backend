const db = require('../db');
const { httpError } = require('../utils/httpError');

const BOOKING_STATUSES = new Set(['pending', 'confirmed', 'cancelled', 'completed']);
const PRIVILEGED_ROLES = new Set(['admin', 'moderator']);

function isPrivileged(user) {
  return Boolean(user?.roles?.some((role) => PRIVILEGED_ROLES.has(role)));
}

function mapBooking(row) {
  return {
    id: row.id,
    service_id: row.service_id,
    student_id: row.student_id,
    trainer_id: row.trainer_id,
    scheduled_at: row.scheduled_at,
    status: row.status,
    notes: row.notes,
    created_at: row.created_at,
    service: row.service_title
      ? {
          title: row.service_title,
          price: Number(row.service_price) || 0,
          duration_minutes: Number(row.service_duration_minutes) || 0,
          service_type: row.service_type,
        }
      : null,
    student: {
      full_name: row.student_name || 'غير معروف',
      avatar_url: row.student_avatar || null,
    },
    trainer: {
      full_name: row.trainer_name || 'غير معروف',
      avatar_url: row.trainer_avatar || null,
    },
    review_id: row.review_id || null,
  };
}

async function getBookingById(executor, bookingId) {
  const result = await executor.query(
    `
      SELECT
        b.*,
        s.title AS service_title,
        s.price AS service_price,
        s.duration_minutes AS service_duration_minutes,
        s.service_type,
        sp.full_name AS student_name,
        sp.avatar_url AS student_avatar,
        tp.full_name AS trainer_name,
        tp.avatar_url AS trainer_avatar,
        r.id AS review_id
      FROM service_bookings b
      INNER JOIN trainer_services s ON s.id = b.service_id
      LEFT JOIN profiles sp ON sp.id = b.student_id
      LEFT JOIN profiles tp ON tp.id = b.trainer_id
      LEFT JOIN service_reviews r ON r.booking_id = b.id
      WHERE b.id = $1
      LIMIT 1
    `,
    [bookingId]
  );
  return result.rows[0] || null;
}

class BookingService {
  static async listBookings({ reqUser, scope = 'student' }) {
    if (!reqUser?.id) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    if (!['student', 'trainer'].includes(scope)) {
      throw httpError(400, 'Invalid booking scope', 'INVALID_BOOKING_SCOPE');
    }

    const column = scope === 'trainer' ? 'b.trainer_id' : 'b.student_id';
    const result = await db.query(
      `
        SELECT
          b.*,
          s.title AS service_title,
          s.price AS service_price,
          s.duration_minutes AS service_duration_minutes,
          s.service_type,
          sp.full_name AS student_name,
          sp.avatar_url AS student_avatar,
          tp.full_name AS trainer_name,
          tp.avatar_url AS trainer_avatar,
          r.id AS review_id
        FROM service_bookings b
        INNER JOIN trainer_services s ON s.id = b.service_id
        LEFT JOIN profiles sp ON sp.id = b.student_id
        LEFT JOIN profiles tp ON tp.id = b.trainer_id
        LEFT JOIN service_reviews r ON r.booking_id = b.id
        WHERE ${column} = $1
        ORDER BY b.scheduled_at DESC
      `,
      [reqUser.id]
    );

    return result.rows.map(mapBooking);
  }

  static async createBooking({ reqUser, payload }) {
    if (!reqUser?.id) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const scheduledAt = new Date(payload.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw httpError(400, 'Booking time must be in the future', 'BOOKING_TIME_INVALID');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const serviceResult = await client.query(
        `
          SELECT id, trainer_id, title, duration_minutes, price, service_type, is_active
          FROM trainer_services
          WHERE id = $1
          LIMIT 1
        `,
        [payload.service_id]
      );
      const service = serviceResult.rows[0];
      if (!service || !service.is_active) {
        throw httpError(404, 'Service not found or unavailable', 'SERVICE_UNAVAILABLE');
      }

      if (service.trainer_id === reqUser.id) {
        throw httpError(400, 'You cannot book your own service', 'SELF_BOOKING_NOT_ALLOWED');
      }

      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `tartelea:trainer-booking:${service.trainer_id}`,
      ]);

      const durationMinutes = Math.max(Number(service.duration_minutes) || 60, 1);
      const conflictResult = await client.query(
        `
          SELECT 1
          FROM service_bookings existing
          INNER JOIN trainer_services existing_service ON existing_service.id = existing.service_id
          WHERE existing.trainer_id = $1
            AND existing.status IN ('pending', 'confirmed')
            AND existing.scheduled_at < ($2::timestamptz + ($3::text || ' minutes')::interval)
            AND (
              existing.scheduled_at +
              (GREATEST(COALESCE(existing_service.duration_minutes, 60), 1)::text || ' minutes')::interval
            ) > $2::timestamptz
          LIMIT 1
        `,
        [service.trainer_id, scheduledAt.toISOString(), durationMinutes]
      );

      if (conflictResult.rowCount > 0) {
        throw httpError(409, 'The selected time conflicts with another booking', 'BOOKING_TIME_CONFLICT');
      }

      const insertResult = await client.query(
        `
          INSERT INTO service_bookings (
            service_id,
            student_id,
            trainer_id,
            scheduled_at,
            status,
            notes
          )
          VALUES ($1, $2, $3, $4, 'pending', $5)
          RETURNING id
        `,
        [
          service.id,
          reqUser.id,
          service.trainer_id,
          scheduledAt.toISOString(),
          payload.notes?.trim() || null,
        ]
      );

      const row = await getBookingById(client, insertResult.rows[0].id);
      await client.query('COMMIT');
      return mapBooking(row);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateStatus({ reqUser, bookingId, status }) {
    if (!reqUser?.id) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }
    if (!BOOKING_STATUSES.has(status)) {
      throw httpError(400, 'Invalid booking status', 'INVALID_BOOKING_STATUS');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const row = await getBookingById(client, bookingId);
      if (!row) {
        throw httpError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
      }

      const privileged = isPrivileged(reqUser);
      const isTrainer = row.trainer_id === reqUser.id;
      const isStudent = row.student_id === reqUser.id;

      if (!privileged && !isTrainer && !isStudent) {
        throw httpError(403, 'Access denied', 'BOOKING_ACCESS_DENIED');
      }

      if (!privileged) {
        const current = row.status;
        const trainerTransitions = {
          pending: new Set(['confirmed', 'cancelled']),
          confirmed: new Set(['completed', 'cancelled']),
          cancelled: new Set(),
          completed: new Set(),
        };
        const studentTransitions = {
          pending: new Set(['cancelled']),
          confirmed: new Set(),
          cancelled: new Set(),
          completed: new Set(),
        };

        const allowed = isTrainer
          ? trainerTransitions[current]?.has(status)
          : studentTransitions[current]?.has(status);

        if (!allowed) {
          throw httpError(409, 'This booking status transition is not allowed', 'BOOKING_STATUS_TRANSITION_DENIED');
        }
      }

      await client.query(
        'UPDATE service_bookings SET status = $1 WHERE id = $2',
        [status, bookingId]
      );

      const updated = await getBookingById(client, bookingId);
      await client.query('COMMIT');
      return mapBooking(updated);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async createReview({ reqUser, bookingId, payload }) {
    if (!reqUser?.id) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const booking = await getBookingById(client, bookingId);
      if (!booking) {
        throw httpError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
      }
      if (booking.student_id !== reqUser.id) {
        throw httpError(403, 'Only the booking student can submit a review', 'REVIEW_ACCESS_DENIED');
      }
      if (booking.status !== 'completed') {
        throw httpError(409, 'Only completed bookings can be reviewed', 'BOOKING_NOT_COMPLETED');
      }

      const result = await client.query(
        `
          INSERT INTO service_reviews (
            booking_id,
            service_id,
            student_id,
            trainer_id,
            rating,
            review
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          booking.id,
          booking.service_id,
          booking.student_id,
          booking.trainer_id,
          payload.rating,
          payload.review?.trim() || null,
        ]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        throw httpError(409, 'This booking has already been reviewed', 'REVIEW_ALREADY_EXISTS');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  static async listReviews({ trainerId, serviceId, limit = 50, offset = 0 }) {
    const params = [];
    const where = [];

    if (trainerId) {
      params.push(trainerId);
      where.push(`r.trainer_id = $${params.length}`);
    }
    if (serviceId) {
      params.push(serviceId);
      where.push(`r.service_id = $${params.length}`);
    }

    params.push(Math.min(Math.max(limit, 1), 100));
    const limitParam = `$${params.length}`;
    params.push(Math.max(offset, 0));
    const offsetParam = `$${params.length}`;

    const result = await db.query(
      `
        SELECT
          r.*,
          p.full_name AS student_name,
          p.avatar_url AS student_avatar,
          s.title AS service_title
        FROM service_reviews r
        LEFT JOIN profiles p ON p.id = r.student_id
        LEFT JOIN trainer_services s ON s.id = r.service_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY r.created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params
    );

    return result.rows;
  }
}

module.exports = BookingService;
