const { z } = require('zod');

const uuid = z.string().uuid();

const resolveReportSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    status: z.enum(['resolved', 'dismissed']),
    note: z.string().trim().max(1000).optional().or(z.literal('')),
  }),
});

const assignSessionHostSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ host_id: uuid }),
});

const endSessionSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    reason: z.string().trim().max(500).optional().or(z.literal('')),
  }).optional(),
});

const broadcastNotificationSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(2000),
    type: z.enum(['system', 'room', 'message']).optional(),
    target_role: z.enum(['all', 'admin', 'moderator', 'trainer', 'member', 'student']).optional(),
  }),
});

module.exports = {
  resolveReportSchema,
  assignSessionHostSchema,
  endSessionSchema,
  broadcastNotificationSchema,
};
