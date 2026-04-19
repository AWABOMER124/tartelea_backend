const { z } = require('zod');
const {
  PLAN_CODES,
  SUBSCRIPTION_SOURCES,
} = require('../../domain/subscriptions');

const uuid = z.string().uuid();

const listPlansSchema = z.object({
  query: z.object({}).optional(),
});

const getMySubscriptionSchema = z.object({
  query: z.object({}).optional(),
});

const listAdminSubscriptionsSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    plan_code: z.enum(PLAN_CODES).optional(),
    status: z.enum(['active', 'expired', 'canceled']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
});

const grantSubscriptionSchema = z.object({
  body: z.object({
    user_id: uuid,
    plan_code: z.enum(PLAN_CODES),
    starts_at: z.string().datetime().optional(),
    ends_at: z.string().datetime().optional().or(z.null()),
    source: z.enum(SUBSCRIPTION_SOURCES).optional(),
    provider: z.string().trim().min(1).max(60).optional().or(z.null()),
    provider_reference: z.string().trim().min(1).max(180).optional().or(z.null()),
    metadata: z.record(z.any()).optional(),
  }),
});

const revokeSubscriptionSchema = z.object({
  body: z.object({
    subscription_id: uuid.optional(),
    user_id: uuid.optional(),
    plan_code: z.enum(PLAN_CODES).optional(),
    course_id: uuid.optional(),
    reason: z.string().trim().max(500).optional(),
  }).refine(
    (value) => Boolean(value.subscription_id || (value.user_id && value.plan_code)),
    {
      message: 'subscription_id or (user_id + plan_code) is required',
      path: ['subscription_id'],
    }
  ),
});

module.exports = {
  getMySubscriptionSchema,
  grantSubscriptionSchema,
  listAdminSubscriptionsSchema,
  listPlansSchema,
  revokeSubscriptionSchema,
};
