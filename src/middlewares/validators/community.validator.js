const { z } = require('zod');

const uuid = z.string().uuid();
const contextTypes = ['general', 'program', 'track', 'course', 'workshop', 'audio_room', 'speaker'];
const visibilities = [
  'public',
  'authenticated',
  'members_only',
  'premium_only',
  'program_enrolled',
  'track_enrolled',
  'session_registered',
];
const reportTargetTypes = ['post', 'comment', 'question'];
const moderationTargetTypes = ['post', 'comment'];
const moderationActions = ['hide', 'unhide', 'delete', 'restore', 'lock', 'unlock'];
const questionStatuses = ['pending', 'approved', 'answered', 'rejected', 'archived'];

const listFeedSchema = z.object({
  query: z.object({
    context_id: uuid.optional(),
    kind: z.enum(['discussion', 'announcement']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

const createCommunityPostSchema = z.object({
  body: z.object({
    kind: z.enum(['discussion', 'announcement']).optional(),
    title: z.string().trim().min(1).max(180).optional(),
    body: z.string().trim().min(1).max(4000),
    primary_context_id: uuid,
    secondary_context_ids: z.array(uuid).max(3).optional(),
    attachment_ids: z.array(uuid).max(4).optional(),
  }),
});

const getPostSchema = z.object({
  params: z.object({
    postId: uuid,
  }),
});

const createCommunityCommentSchema = z.object({
  params: z.object({
    postId: uuid,
  }),
  body: z.object({
    body: z.string().trim().min(1).max(2000),
    parent_comment_id: uuid.nullable().optional(),
  }),
});

const postReactionSchema = z.object({
  params: z.object({
    postId: uuid,
  }),
  body: z.object({
    reaction_type: z.literal('like').optional(),
    active: z.boolean().optional(),
  }),
});

const commentReactionSchema = z.object({
  params: z.object({
    commentId: uuid,
  }),
  body: z.object({
    reaction_type: z.literal('like').optional(),
    active: z.boolean().optional(),
  }),
});

const createReportSchema = z.object({
  body: z.object({
    target_type: z.enum(reportTargetTypes),
    target_id: uuid,
    reason_code: z.enum(['spam', 'abuse', 'off_topic', 'misinformation', 'copyright', 'other']),
    note: z.string().trim().max(1000).optional(),
  }),
});

const listSessionQuestionsSchema = z.object({
  query: z.object({
    context_id: uuid,
    status: z.enum(questionStatuses).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

const createSessionQuestionSchema = z.object({
  body: z.object({
    context_id: uuid,
    body: z.string().trim().min(1).max(1000),
    addressed_to_id: uuid.optional(),
    is_anonymous: z.boolean().optional(),
  }),
});

const communityProfileSchema = z.object({
  params: z.object({
    userId: uuid,
  }),
});

const listReportsSchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'reviewed', 'resolved', 'dismissed']).optional(),
    target_type: z.enum(reportTargetTypes).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
});

const listAdminPostsSchema = z.object({
  query: z.object({
    status: z.enum(['published', 'hidden', 'deleted', 'archived']).optional(),
    context_id: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
});

const listPinsSchema = z.object({
  query: z.object({
    context_id: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
});

const upsertContextSchema = z.object({
  body: z.object({
    context_type: z.enum(contextTypes),
    source_system: z.string().trim().min(1).max(60),
    source_id: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(180),
    subtitle: z.string().trim().max(180).optional(),
    description: z.string().trim().max(1000).optional(),
    visibility: z.enum(visibilities).optional(),
    membership_rule: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
    is_active: z.boolean().optional(),
  }),
});

const updateContextSchema = z.object({
  params: z.object({
    contextId: uuid,
  }),
  body: z.object({
    slug: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(180).optional(),
    subtitle: z.string().trim().max(180).optional(),
    description: z.string().trim().max(1000).optional(),
    visibility: z.enum(visibilities).optional(),
    membership_rule: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
    is_active: z.boolean().optional(),
  }),
});

const moderationActionSchema = z.object({
  body: z.object({
    action_type: z.enum(moderationActions),
    target_type: z.enum(moderationTargetTypes),
    target_id: uuid,
    report_id: uuid.optional(),
    reason: z.string().trim().max(1000).optional(),
  }),
});

const createPinSchema = z.object({
  body: z.object({
    context_id: uuid,
    post_id: uuid,
    reason: z.string().trim().max(500).optional(),
    sort_order: z.number().int().min(0).max(1000).optional(),
    ends_at: z.string().datetime().optional().or(z.null()),
  }),
});

const deletePinSchema = z.object({
  params: z.object({
    pinId: uuid,
  }),
});

const updateSessionQuestionSchema = z.object({
  params: z.object({
    questionId: uuid,
  }),
  body: z.object({
    status: z.enum(questionStatuses).optional(),
    answer_text: z.string().trim().max(2000).optional(),
    rejected_reason: z.string().trim().max(500).optional(),
    addressed_to_id: uuid.optional().or(z.null()),
  }),
});

module.exports = {
  listFeedSchema,
  createCommunityPostSchema,
  getPostSchema,
  createCommunityCommentSchema,
  postReactionSchema,
  commentReactionSchema,
  createReportSchema,
  listSessionQuestionsSchema,
  createSessionQuestionSchema,
  communityProfileSchema,
  listReportsSchema,
  listAdminPostsSchema,
  listPinsSchema,
  upsertContextSchema,
  updateContextSchema,
  moderationActionSchema,
  createPinSchema,
  deletePinSchema,
  updateSessionQuestionSchema,
};
