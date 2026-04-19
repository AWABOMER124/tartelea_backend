const { z } = require('zod');

const uuid = z.string().uuid();
const contentCategories = ['quran', 'values', 'community', 'sudan_awareness', 'arab_awareness', 'islamic_awareness'];
const sessionStatuses = ['scheduled', 'live', 'ended'];
const accessTypes = ['public', 'subscribers_only'];
const sessionActions = [
  'promote_speaker',
  'demote_listener',
  'promote_co_host',
  'promote_moderator',
  'kick',
  'raise_hand',
  'lower_hand',
  'accept_hand',
  'reject_hand',
  'start_live',
  'end_session',
];

const listSessionsSchema = z.object({
  query: z.object({
    status: z.enum(sessionStatuses).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
});

const getSessionSchema = z.object({
  params: z.object({
    id: uuid,
  }),
});

const createSessionSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().max(2000).optional(),
    category: z.enum(contentCategories).optional(),
    scheduled_at: z.string().datetime().optional(),
    duration_minutes: z.coerce.number().int().min(15).max(240).optional(),
    price: z.coerce.number().min(0).optional(),
    max_participants: z.coerce.number().int().min(2).max(500).optional(),
    access_type: z.enum(accessTypes).optional(),
    image_url: z.string().url().optional(),
  }),
});

const joinSessionSchema = z.object({
  params: z.object({
    id: uuid,
  }),
});

const leaveSessionSchema = z.object({
  params: z.object({
    id: uuid,
  }),
});

const sessionActionSchema = z.object({
  params: z.object({
    id: uuid,
  }),
  body: z.object({
    action: z.enum(sessionActions),
    target_user_id: uuid.optional(),
  }),
});

module.exports = {
  listSessionsSchema,
  getSessionSchema,
  createSessionSchema,
  joinSessionSchema,
  leaveSessionSchema,
  sessionActionSchema,
};
