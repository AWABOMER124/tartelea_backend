const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listBookingsSchema,
  createBookingSchema,
  updateBookingStatusSchema,
  createReviewSchema,
  listReviewsSchema,
} = require('../../src/middlewares/validators/booking.validator');

const uuid = '11111111-1111-4111-8111-111111111111';

test('createBookingSchema accepts valid future-style ISO payload', () => {
  const parsed = createBookingSchema.parse({
    body: {
      service_id: uuid,
      scheduled_at: '2026-10-01T10:00:00.000Z',
      notes: 'جلسة خاصة',
    },
  });
  assert.equal(parsed.body.service_id, uuid);
});

test('createBookingSchema rejects invalid service id', () => {
  assert.throws(() => {
    createBookingSchema.parse({
      body: {
        service_id: 'not-a-uuid',
        scheduled_at: '2026-10-01T10:00:00.000Z',
      },
    });
  });
});

test('updateBookingStatusSchema accepts supported states only', () => {
  const parsed = updateBookingStatusSchema.parse({
    params: { id: uuid },
    body: { status: 'confirmed' },
  });
  assert.equal(parsed.body.status, 'confirmed');

  assert.throws(() => {
    updateBookingStatusSchema.parse({
      params: { id: uuid },
      body: { status: 'refunded' },
    });
  });
});

test('createReviewSchema constrains rating range', () => {
  assert.equal(
    createReviewSchema.parse({
      params: { id: uuid },
      body: { rating: 5, review: 'ممتاز' },
    }).body.rating,
    5,
  );

  assert.throws(() => {
    createReviewSchema.parse({
      params: { id: uuid },
      body: { rating: 6 },
    });
  });
});

test('list booking/review schemas coerce query values safely', () => {
  const list = listBookingsSchema.parse({ query: { scope: 'trainer' } });
  assert.equal(list.query.scope, 'trainer');

  const reviews = listReviewsSchema.parse({
    query: { service_id: uuid, limit: '10', offset: '0' },
  });
  assert.equal(reviews.query.limit, 10);
  assert.equal(reviews.query.offset, 0);
});
