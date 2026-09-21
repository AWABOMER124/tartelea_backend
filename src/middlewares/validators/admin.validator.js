const { z } = require('zod');

const uuid = z.string().uuid();
const assignableRole = z.enum(['admin', 'moderator', 'trainer', 'member', 'student']);

const idParamSchema = z.object({
  params: z.object({ id: uuid }),
});

const userRoleSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ role: assignableRole }),
});

const userRolesSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ roles: z.array(assignableRole).min(1).max(4) }),
});

const userStatusSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    status: z.enum(['active', 'suspended', 'deactivated']),
    reason: z.string().trim().max(500).optional().or(z.literal('')),
  }),
});

const approvalSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ is_approved: z.boolean() }),
});

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
  idParamSchema,
  userRoleSchema,
  userRolesSchema,
  userStatusSchema,
  approvalSchema,
  resolveReportSchema,
  assignSessionHostSchema,
  endSessionSchema,
  broadcastNotificationSchema,
};
