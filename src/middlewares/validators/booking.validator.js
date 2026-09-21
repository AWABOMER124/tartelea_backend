const { z } = require('zod');

const uuid = z.string().uuid();

const listBookingsSchema = z.object({
  query: z.object({
    scope: z.enum(['student', 'trainer']).default('student'),
  }),
});

const createBookingSchema = z.object({
  body: z.object({
    service_id: uuid,
    scheduled_at: z.string().datetime(),
    notes: z.string().trim().max(1000).optional(),
  }),
});

const updateBookingStatusSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']),
  }),
});

const createReviewSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    rating: z.coerce.number().int().min(1).max(5),
    review: z.string().trim().max(2000).optional(),
  }),
});

const listReviewsSchema = z.object({
  query: z.object({
    trainer_id: uuid.optional(),
    service_id: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
});

module.exports = {
  listBookingsSchema,
  createBookingSchema,
  updateBookingStatusSchema,
  createReviewSchema,
  listReviewsSchema,
};
