const db = require('../db');
const { httpError } = require('../utils/httpError');
const SubscriptionService = require('./subscription.service');
const {
  canManageSessionQuestion,
  hasPrivilegedRole,
  isContextReadable,
  isContextWritable,
  normalizeUser,
} = require('./community.policy');

const SESSION_CONTEXT_TYPES = new Set(['workshop', 'audio_room', 'speaker']);
const MODERATION_TARGET_TABLES = {
  post: 'community_posts',
  comment: 'community_comments',
};

const DEFAULT_GENERAL_CONTEXT = {
  context_type: 'general',
  source_system: 'backend',
  source_id: 'general',
  slug: 'general-community',
  title: 'General Community',
  subtitle: 'Main community feed',
  description: 'Default general community feed',
  visibility: 'authenticated',
  membership_rule: {},
  metadata: { icon: 'community' },
};

function parseCursor(cursor) {
  if (!cursor || typeof cursor !== 'string' || !cursor.includes('__')) {
    return null;
  }

  const [timestamp, id] = cursor.split('__');
  if (!timestamp || !id) {
    return null;
  }

  return { timestamp, id };
}

function buildCursor(timestamp, id) {
  return timestamp && id ? `${timestamp}__${id}` : null;
}

function addParam(params, value) {
  params.push(value);
  return `$${params.length}`;
}

function mapContext(row) {
  return {
    id: row.context_id || row.id,
    type: row.context_type,
    source_system: row.source_system,
    source_id: row.source_id,
    slug: row.context_slug || row.slug,
    title: row.context_title || row.title,
    subtitle: row.context_subtitle || row.subtitle,
    description: row.context_description || row.description,
    visibility: row.context_visibility || row.visibility,
    membership_rule: row.context_membership_rule || row.membership_rule || {},
    metadata: row.context_metadata || row.metadata || {},
    is_active: row.context_is_active ?? row.is_active ?? true,
  };
}

function mapPost(row, user, subscriptionSnapshot = null) {
  const context = mapContext(row);

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    status: row.status,
    is_locked: row.is_locked,
    primary_context: context,
    author: {
      id: row.author_id,
      name: row.author_name || 'Member',
      avatar_url: row.author_avatar_url,
    },
    counts: {
      comments: row.comments_count || 0,
      reactions: row.reactions_count || 0,
      attachments: row.attachments_count || 0,
    },
    viewer_state: {
      liked: Boolean(row.viewer_liked),
      can_comment: Boolean(user) && !row.is_locked && isContextWritable(context, user, 'comment', subscriptionSnapshot),
      can_moderate: hasPrivilegedRole(user),
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_activity_at: row.last_activity_at,
    edited_at: row.edited_at,
    pin: row.pin_id
      ? {
          id: row.pin_id,
          sort_order: row.pin_sort_order,
          ends_at: row.pin_ends_at,
        }
      : null,
  };
}

function mapComment(row, user, subscriptionSnapshot = null) {
  const context = row.context_id ? mapContext(row) : null;

  return {
    id: row.id,
    post_id: row.post_id,
    parent_comment_id: row.parent_comment_id,
    depth: row.depth,
    body: row.body,
    status: row.status,
    author: {
      id: row.author_id,
      name: row.author_name || 'Member',
      avatar_url: row.author_avatar_url,
    },
    counts: {
      replies: row.replies_count || 0,
      reactions: row.reactions_count || 0,
    },
    viewer_state: {
      liked: Boolean(row.viewer_liked),
      can_reply:
        Boolean(user) &&
        Boolean(context) &&
        Number(row.depth) === 0 &&
        !Boolean(row.post_is_locked) &&
        isContextWritable(context, user, 'comment', subscriptionSnapshot),
      can_moderate: hasPrivilegedRole(user),
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited_at: row.edited_at,
    replies: [],
  };
}

function mapQuestion(row, user, subscriptionSnapshot = null) {
  const context = mapContext(row);

  return {
    id: row.id,
    body: row.body,
    status: row.status,
    is_anonymous: row.is_anonymous,
    answer_text: row.answer_text,
    rejected_reason: row.rejected_reason,
    asked_by: row.is_anonymous
      ? null
      : {
          id: row.asked_by_id,
          name: row.asked_by_name || 'Member',
        },
    addressed_to: row.addressed_to_id
      ? {
          id: row.addressed_to_id,
          name: row.addressed_to_name || 'Speaker',
        }
      : null,
    answered_by: row.answered_by_id
      ? {
          id: row.answered_by_id,
          name: row.answered_by_name || 'Host',
        }
      : null,
    context,
    viewer_state: {
      can_manage: canManageSessionQuestion(context, row, user, subscriptionSnapshot),
      can_moderate: hasPrivilegedRole(user),
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    answered_at: row.answered_at,
    approved_at: row.approved_at,
  };
}

function mapReport(row) {
  return {
    id: row.id,
    target_type: row.target_type,
    status: row.status,
    reason_code: row.reason_code,
    note: row.note,
    resolution_note: row.resolution_note,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
  };
}

function mapAdminPost(row) {
  return {
    ...mapPost(row, null),
    pending_reports_count: Number(row.pending_reports_count) || 0,
  };
}

function mapPin(row) {
  return {
    id: row.id,
    context_id: row.context_id,
    context_title: row.context_title,
    post_id: row.post_id,
    post_title: row.post_title,
    pinned_by: row.pinned_by,
    pinned_by_name: row.pinned_by_name || 'Moderator',
    reason: row.reason,
    sort_order: row.sort_order,
    ends_at: row.ends_at,
    created_at: row.created_at,
  };
}

async function ensureGeneralContext(executor = db) {
  const result = await executor.query(
    `
      INSERT INTO community_contexts (
        context_type,
        source_system,
        source_id,
        slug,
        title,
        subtitle,
        description,
        visibility,
        membership_rule,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
      ON CONFLICT (slug)
      DO UPDATE SET updated_at = NOW()
      RETURNING *
    `,
    [
      DEFAULT_GENERAL_CONTEXT.context_type,
      DEFAULT_GENERAL_CONTEXT.source_system,
      DEFAULT_GENERAL_CONTEXT.source_id,
      DEFAULT_GENERAL_CONTEXT.slug,
      DEFAULT_GENERAL_CONTEXT.title,
      DEFAULT_GENERAL_CONTEXT.subtitle,
      DEFAULT_GENERAL_CONTEXT.description,
      DEFAULT_GENERAL_CONTEXT.visibility,
      JSON.stringify(DEFAULT_GENERAL_CONTEXT.membership_rule),
      JSON.stringify(DEFAULT_GENERAL_CONTEXT.metadata),
    ]
  );

  return result.rows[0];
}

async function getContextById(executor, contextId) {
  const result = await executor.query('SELECT * FROM community_contexts WHERE id = $1 LIMIT 1', [contextId]);
  return result.rows[0] || null;
}

async function getPostRowById(executor, postId, viewerId = null) {
  const result = await executor.query(
    `
      SELECT
        p.*,
        ctx.id AS context_id,
        ctx.context_type,
        ctx.source_system,
        ctx.source_id,
        ctx.slug AS context_slug,
        ctx.title AS context_title,
        ctx.subtitle AS context_subtitle,
        ctx.description AS context_description,
        ctx.visibility AS context_visibility,
        ctx.membership_rule AS context_membership_rule,
        ctx.metadata AS context_metadata,
        ctx.is_active AS context_is_active,
        pr.full_name AS author_name,
        pr.avatar_url AS author_avatar_url,
        EXISTS (
          SELECT 1
          FROM community_reactions vr
          WHERE vr.post_id = p.id
            AND vr.user_id = $2
            AND vr.reaction_type = 'like'
        ) AS viewer_liked
      FROM community_posts p
      JOIN community_contexts ctx ON ctx.id = p.primary_context_id
      LEFT JOIN profiles pr ON pr.id = p.author_id
      WHERE p.id = $1
      LIMIT 1
    `,
    [postId, viewerId]
  );

  return result.rows[0] || null;
}

async function listCommentRows(executor, postId, viewerId = null) {
  const result = await executor.query(
    `
      SELECT
        c.*,
        p.is_locked AS post_is_locked,
        ctx.id AS context_id,
        ctx.context_type,
        ctx.source_system,
        ctx.source_id,
        ctx.slug AS context_slug,
        ctx.title AS context_title,
        ctx.subtitle AS context_subtitle,
        ctx.description AS context_description,
        ctx.visibility AS context_visibility,
        ctx.membership_rule AS context_membership_rule,
        ctx.metadata AS context_metadata,
        ctx.is_active AS context_is_active,
        pr.full_name AS author_name,
        pr.avatar_url AS author_avatar_url,
        EXISTS (
          SELECT 1
          FROM community_reactions vr
          WHERE vr.comment_id = c.id
            AND vr.user_id = $2
            AND vr.reaction_type = 'like'
        ) AS viewer_liked
      FROM community_comments c
      JOIN community_posts p ON p.id = c.post_id
      JOIN community_contexts ctx ON ctx.id = p.primary_context_id
      LEFT JOIN profiles pr ON pr.id = c.author_id
      WHERE c.post_id = $1
        AND c.status = 'published'
        AND c.deleted_at IS NULL
      ORDER BY c.created_at ASC
    `,
    [postId, viewerId]
  );

  return result.rows;
}

async function getCommentRowById(executor, commentId, viewerId = null) {
  const result = await executor.query(
    `
      SELECT
        c.*,
        p.status AS post_status,
        p.deleted_at AS post_deleted_at,
        p.is_locked AS post_is_locked,
        ctx.id AS context_id,
        ctx.context_type,
        ctx.source_system,
        ctx.source_id,
        ctx.slug AS context_slug,
        ctx.title AS context_title,
        ctx.subtitle AS context_subtitle,
        ctx.description AS context_description,
        ctx.visibility AS context_visibility,
        ctx.membership_rule AS context_membership_rule,
        ctx.metadata AS context_metadata,
        ctx.is_active AS context_is_active,
        pr.full_name AS author_name,
        pr.avatar_url AS author_avatar_url,
        EXISTS (
          SELECT 1
          FROM community_reactions vr
          WHERE vr.comment_id = c.id
            AND vr.user_id = $2
            AND vr.reaction_type = 'like'
        ) AS viewer_liked
      FROM community_comments c
      JOIN community_posts p ON p.id = c.post_id
      JOIN community_contexts ctx ON ctx.id = p.primary_context_id
      LEFT JOIN profiles pr ON pr.id = c.author_id
      WHERE c.id = $1
      LIMIT 1
    `,
    [commentId, viewerId]
  );

  return result.rows[0] || null;
}

async function getSessionQuestionRowById(executor, questionId) {
  const result = await executor.query(
    `
      SELECT
        q.*,
        ctx.id AS context_id,
        ctx.context_type,
        ctx.source_system,
        ctx.source_id,
        ctx.slug AS context_slug,
        ctx.title AS context_title,
        ctx.subtitle AS context_subtitle,
        ctx.description AS context_description,
        ctx.visibility AS context_visibility,
        ctx.membership_rule AS context_membership_rule,
        ctx.metadata AS context_metadata,
        ctx.is_active AS context_is_active,
        asker.full_name AS asked_by_name,
        addressed.full_name AS addressed_to_name,
        answered.full_name AS answered_by_name
      FROM session_questions q
      JOIN community_contexts ctx ON ctx.id = q.context_id
      LEFT JOIN profiles asker ON asker.id = q.asked_by_id
      LEFT JOIN profiles addressed ON addressed.id = q.addressed_to_id
      LEFT JOIN profiles answered ON answered.id = q.answered_by_id
      WHERE q.id = $1
      LIMIT 1
    `,
    [questionId]
  );

  return result.rows[0] || null;
}

function buildCommentTree(rows, user, subscriptionSnapshot = null) {
  const items = rows.map((row) => mapComment(row, user, subscriptionSnapshot));
  const byId = new Map(items.map((item) => [item.id, item]));
  const roots = [];

  for (const item of items) {
    if (!item.parent_comment_id) {
      roots.push(item);
      continue;
    }

    const parent = byId.get(item.parent_comment_id);
    if (parent) {
      parent.replies.push(item);
    }
  }

  return roots;
}

class CommunityService {
  static async listContexts(reqUser) {
    const user = normalizeUser(reqUser);
    const subscriptionSnapshot = user ? await SubscriptionService.getUserSnapshot(user) : null;
    await ensureGeneralContext();

    const result = await db.query(
      `
        SELECT *
        FROM community_contexts
        WHERE is_active = TRUE
        ORDER BY
          CASE context_type
            WHEN 'general' THEN 0
            WHEN 'program' THEN 1
            WHEN 'track' THEN 2
            WHEN 'course' THEN 3
            WHEN 'workshop' THEN 4
            WHEN 'audio_room' THEN 5
            ELSE 6
          END,
          title ASC
      `
    );

    return result.rows
      .filter((row) => isContextReadable(row, user, subscriptionSnapshot))
      .map((row) => mapContext(row));
  }

  static async listFeed({ reqUser, contextId, kind, cursor, limit = 20 }) {
    const user = normalizeUser(reqUser);
    const subscriptionSnapshot = user ? await SubscriptionService.getUserSnapshot(user) : null;
    await ensureGeneralContext();

    let scopedContext = null;
    if (contextId) {
      scopedContext = await getContextById(db, contextId);
      if (!scopedContext) {
        throw httpError(404, 'Community context not found', 'COMMUNITY_CONTEXT_NOT_FOUND');
      }
      if (!isContextReadable(scopedContext, user, subscriptionSnapshot)) {
        throw httpError(403, 'Access denied for this community context', 'COMMUNITY_ACCESS_DENIED');
      }
    }

    const parsedCursor = parseCursor(cursor);
    const pinnedRows = [];
    const excludedPinnedIds = [];

    if (scopedContext && !parsedCursor) {
      const pinnedResult = await db.query(
        `
          SELECT
            p.*,
            cp.id AS pin_id,
            cp.sort_order AS pin_sort_order,
            cp.ends_at AS pin_ends_at,
            ctx.id AS context_id,
            ctx.context_type,
            ctx.source_system,
            ctx.source_id,
            ctx.slug AS context_slug,
            ctx.title AS context_title,
            ctx.subtitle AS context_subtitle,
            ctx.description AS context_description,
            ctx.visibility AS context_visibility,
            ctx.membership_rule AS context_membership_rule,
            ctx.metadata AS context_metadata,
            ctx.is_active AS context_is_active,
            pr.full_name AS author_name,
            pr.avatar_url AS author_avatar_url,
            EXISTS (
              SELECT 1
              FROM community_reactions vr
              WHERE vr.post_id = p.id
                AND vr.user_id = $2
                AND vr.reaction_type = 'like'
            ) AS viewer_liked
          FROM community_pins cp
          JOIN community_posts p ON p.id = cp.post_id
          JOIN community_contexts ctx ON ctx.id = p.primary_context_id
          LEFT JOIN profiles pr ON pr.id = p.author_id
          WHERE cp.context_id = $1
            AND p.status = 'published'
            AND p.deleted_at IS NULL
            AND cp.starts_at <= NOW()
            AND (cp.ends_at IS NULL OR cp.ends_at > NOW())
          ORDER BY cp.sort_order ASC, cp.created_at DESC
          LIMIT 3
        `,
        [contextId, user?.id || null]
      );

      for (const row of pinnedResult.rows) {
        if (isContextReadable(mapContext(row), user, subscriptionSnapshot)) {
          pinnedRows.push(row);
          excludedPinnedIds.push(row.id);
        }
      }
    }

    const params = [];
    const viewerIdParam = addParam(params, user?.id || null);
    const normalizedLimit = Math.min(Math.max(limit, 1), 50);
    const where = [
      "p.status = 'published'",
      'p.deleted_at IS NULL',
      'ctx.is_active = TRUE',
    ];

    if (!user) {
      where.push("ctx.visibility = 'public'");
    }

    if (kind) {
      where.push(`p.kind = ${addParam(params, kind)}`);
    }

    if (contextId) {
      where.push(
        `EXISTS (
          SELECT 1
          FROM community_post_scopes cps
          WHERE cps.post_id = p.id
            AND cps.context_id = ${addParam(params, contextId)}
        )`
      );
    }

    if (excludedPinnedIds.length > 0) {
      where.push(`NOT (p.id = ANY(${addParam(params, excludedPinnedIds)}::uuid[]))`);
    }

    if (parsedCursor) {
      const tsParam = addParam(params, parsedCursor.timestamp);
      const idParam = addParam(params, parsedCursor.id);
      where.push(`(p.last_activity_at < ${tsParam} OR (p.last_activity_at = ${tsParam} AND p.id < ${idParam}))`);
    }

    const limitParam = addParam(params, normalizedLimit * 3 + 1);
    const result = await db.query(
      `
        SELECT
          p.*,
          ctx.id AS context_id,
          ctx.context_type,
          ctx.source_system,
          ctx.source_id,
          ctx.slug AS context_slug,
          ctx.title AS context_title,
          ctx.subtitle AS context_subtitle,
          ctx.description AS context_description,
          ctx.visibility AS context_visibility,
          ctx.membership_rule AS context_membership_rule,
          ctx.metadata AS context_metadata,
          ctx.is_active AS context_is_active,
          pr.full_name AS author_name,
          pr.avatar_url AS author_avatar_url,
          EXISTS (
            SELECT 1
            FROM community_reactions vr
            WHERE vr.post_id = p.id
              AND vr.user_id = ${viewerIdParam}
              AND vr.reaction_type = 'like'
          ) AS viewer_liked
        FROM community_posts p
        JOIN community_contexts ctx ON ctx.id = p.primary_context_id
        LEFT JOIN profiles pr ON pr.id = p.author_id
        WHERE ${where.join('\n          AND ')}
        ORDER BY p.last_activity_at DESC, p.id DESC
        LIMIT ${limitParam}
      `,
      params
    );

    const filteredRows = result.rows.filter((row) => isContextReadable(mapContext(row), user, subscriptionSnapshot));
    const slicedRows = filteredRows.slice(0, normalizedLimit);
    const nextRow = filteredRows.length > normalizedLimit ? slicedRows[slicedRows.length - 1] : null;

    return {
      pinned_items: pinnedRows.map((row) => mapPost(row, user, subscriptionSnapshot)),
      items: slicedRows.map((row) => mapPost(row, user, subscriptionSnapshot)),
      next_cursor: nextRow ? buildCursor(nextRow.last_activity_at, nextRow.id) : null,
    };
  }

  static async createPost({ reqUser, payload }) {
    const user = normalizeUser(reqUser);
    if (!user) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const subscriptionSnapshot = await SubscriptionService.getUserSnapshot(user);
    const context = await getContextById(db, payload.primary_context_id);
    if (!context) {
      throw httpError(404, 'Community context not found', 'COMMUNITY_CONTEXT_NOT_FOUND');
    }
    if (!isContextWritable(context, user, 'post', subscriptionSnapshot)) {
      throw httpError(403, 'You cannot post in this community context', 'COMMUNITY_ACCESS_DENIED');
    }

    const secondaryScopeIds = [
      ...new Set((payload.secondary_context_ids || []).filter((id) => id !== payload.primary_context_id)),
    ];

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const postResult = await client.query(
        `
          INSERT INTO community_posts (
            author_id,
            primary_context_id,
            kind,
            title,
            body
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [
          user.id,
          payload.primary_context_id,
          payload.kind || 'discussion',
          payload.title || null,
          payload.body.trim(),
        ]
      );

      const postId = postResult.rows[0].id;

      await client.query(
        `
          INSERT INTO community_post_scopes (post_id, context_id, is_primary)
          VALUES ($1, $2, TRUE)
        `,
        [postId, payload.primary_context_id]
      );

      for (const scopeId of secondaryScopeIds) {
        const scopeContext = await getContextById(client, scopeId);
        if (scopeContext && isContextReadable(scopeContext, user, subscriptionSnapshot)) {
          await client.query(
            `
              INSERT INTO community_post_scopes (post_id, context_id, is_primary)
              VALUES ($1, $2, FALSE)
              ON CONFLICT (post_id, context_id) DO NOTHING
            `,
            [postId, scopeId]
          );
        }
      }

      await client.query('COMMIT');
      return this.getPostDetails({ postId, reqUser });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getPostDetails({ postId, reqUser }) {
    const user = normalizeUser(reqUser);
    const subscriptionSnapshot = user ? await SubscriptionService.getUserSnapshot(user) : null;
    const row = await getPostRowById(db, postId, user?.id || null);

    if (!row || row.deleted_at || row.status === 'deleted') {
      throw httpError(404, 'Community post not found', 'COMMUNITY_POST_NOT_FOUND');
    }

    const context = mapContext(row);
    if (!isContextReadable(context, user, subscriptionSnapshot)) {
      throw httpError(403, 'Access denied for this post', 'COMMUNITY_ACCESS_DENIED');
    }

    const scopesResult = await db.query(
      `
        SELECT
          cps.is_primary,
          ctx.id AS context_id,
          ctx.context_type,
          ctx.source_system,
          ctx.source_id,
          ctx.slug,
          ctx.title,
          ctx.subtitle,
          ctx.description,
          ctx.visibility,
          ctx.membership_rule,
          ctx.metadata,
          ctx.is_active
        FROM community_post_scopes cps
        JOIN community_contexts ctx ON ctx.id = cps.context_id
        WHERE cps.post_id = $1
        ORDER BY cps.is_primary DESC, ctx.title ASC
      `,
      [postId]
    );

    const pinResult = await db.query(
      `
        SELECT id, sort_order, ends_at
        FROM community_pins
        WHERE post_id = $1
          AND starts_at <= NOW()
          AND (ends_at IS NULL OR ends_at > NOW())
        ORDER BY sort_order ASC, created_at DESC
        LIMIT 1
      `,
      [postId]
    );

    const commentRows = await listCommentRows(db, postId, user?.id || null);

    return {
      post: {
        ...mapPost(
          {
            ...row,
            pin_id: pinResult.rows[0]?.id || null,
            pin_sort_order: pinResult.rows[0]?.sort_order || null,
            pin_ends_at: pinResult.rows[0]?.ends_at || null,
          },
          user,
          subscriptionSnapshot
        ),
        scopes: scopesResult.rows
          .map((scope) => ({
            ...mapContext(scope),
            is_primary: scope.is_primary,
          }))
          .filter((scope) => isContextReadable(scope, user, subscriptionSnapshot)),
        comments: buildCommentTree(commentRows, user, subscriptionSnapshot),
      },
    };
  }

  static async createComment({ postId, reqUser, payload }) {
    const user = normalizeUser(reqUser);
    if (!user) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const subscriptionSnapshot = await SubscriptionService.getUserSnapshot(user);
    const postRow = await getPostRowById(db, postId, user.id);
    if (!postRow || postRow.deleted_at || postRow.status !== 'published') {
      throw httpError(404, 'Community post not found', 'COMMUNITY_POST_NOT_FOUND');
    }

    const context = mapContext(postRow);
    if (!isContextWritable(context, user, 'comment', subscriptionSnapshot)) {
      throw httpError(403, 'You cannot comment in this community context', 'COMMUNITY_ACCESS_DENIED');
    }

    if (postRow.is_locked) {
      throw httpError(409, 'Comments are locked for this post', 'COMMUNITY_COMMENTS_LOCKED');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let parentId = null;
      let depth = 0;

      if (payload.parent_comment_id) {
        const parentResult = await client.query(
          `
            SELECT id, depth
            FROM community_comments
            WHERE id = $1
              AND post_id = $2
              AND status = 'published'
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [payload.parent_comment_id, postId]
        );

        const parent = parentResult.rows[0];
        if (!parent) {
          throw httpError(404, 'Parent comment not found', 'COMMUNITY_COMMENT_NOT_FOUND');
        }
        if (Number(parent.depth) !== 0) {
          throw httpError(400, 'Reply depth limit reached', 'COMMUNITY_COMMENT_DEPTH_EXCEEDED');
        }

        parentId = parent.id;
        depth = 1;
      }

      const commentResult = await client.query(
        `
          INSERT INTO community_comments (
            post_id,
            parent_comment_id,
            author_id,
            depth,
            body
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [postId, parentId, user.id, depth, payload.body.trim()]
      );

      await client.query(
        `
          UPDATE community_posts
          SET comments_count = comments_count + 1,
              last_activity_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [postId]
      );

      if (parentId) {
        await client.query(
          `
            UPDATE community_comments
            SET replies_count = replies_count + 1,
                updated_at = NOW()
            WHERE id = $1
          `,
          [parentId]
        );
      }

      const finalResult = await client.query(
        `
          SELECT
            c.*,
            pr.full_name AS author_name,
            pr.avatar_url AS author_avatar_url,
            FALSE AS viewer_liked
          FROM community_comments c
          LEFT JOIN profiles pr ON pr.id = c.author_id
          WHERE c.id = $1
          LIMIT 1
        `,
        [commentResult.rows[0].id]
      );

      await client.query('COMMIT');
      return { comment: mapComment(finalResult.rows[0], user, subscriptionSnapshot) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async setReaction({ reqUser, targetType, targetId, payload }) {
    const user = normalizeUser(reqUser);
    if (!user) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const subscriptionSnapshot = await SubscriptionService.getUserSnapshot(user);
    const reactionType = payload.reaction_type || 'like';
    const active = payload.active !== false;
    const isPostTarget = targetType === 'post';
    const tableName = isPostTarget ? 'community_posts' : 'community_comments';
    const targetColumn = isPostTarget ? 'post_id' : 'comment_id';
    const countColumn = 'reactions_count';

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const targetRow = isPostTarget
        ? await getPostRowById(client, targetId, user.id)
        : await getCommentRowById(client, targetId, user.id);

      if (!targetRow) {
        throw httpError(404, 'Community target not found', 'COMMUNITY_TARGET_NOT_FOUND');
      }

      if (isPostTarget) {
        if (targetRow.deleted_at || targetRow.status !== 'published') {
          throw httpError(404, 'Community target not found', 'COMMUNITY_TARGET_NOT_FOUND');
        }
      } else if (
        targetRow.deleted_at ||
        targetRow.status !== 'published' ||
        targetRow.post_deleted_at ||
        targetRow.post_status !== 'published'
      ) {
        throw httpError(404, 'Community target not found', 'COMMUNITY_TARGET_NOT_FOUND');
      }

      const context = mapContext(targetRow);
      if (!isContextReadable(context, user, subscriptionSnapshot)) {
        throw httpError(403, 'Access denied for this community target', 'COMMUNITY_ACCESS_DENIED');
      }

      const existingResult = await client.query(
        `
          SELECT id
          FROM community_reactions
          WHERE user_id = $1
            AND ${targetColumn} = $2
            AND reaction_type = $3
          LIMIT 1
        `,
        [user.id, targetId, reactionType]
      );

      const existing = existingResult.rows[0];

      if (active && !existing) {
        await client.query(
          `
            INSERT INTO community_reactions (user_id, target_type, ${targetColumn}, reaction_type)
            VALUES ($1, $2, $3, $4)
          `,
          [user.id, targetType, targetId, reactionType]
        );

        await client.query(
          `UPDATE ${tableName} SET ${countColumn} = ${countColumn} + 1, updated_at = NOW() WHERE id = $1`,
          [targetId]
        );
      }

      if (!active && existing) {
        await client.query('DELETE FROM community_reactions WHERE id = $1', [existing.id]);
        await client.query(
          `UPDATE ${tableName}
           SET ${countColumn} = GREATEST(${countColumn} - 1, 0),
               updated_at = NOW()
           WHERE id = $1`,
          [targetId]
        );
      }

      const refreshedResult = await client.query(
        `SELECT ${countColumn} FROM ${tableName} WHERE id = $1 LIMIT 1`,
        [targetId]
      );

      await client.query('COMMIT');
      return {
        reaction: {
          target_type: targetType,
          target_id: targetId,
          reaction_type: reactionType,
          active,
          count: refreshedResult.rows[0]?.[countColumn] || 0,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async createReport({ reqUser, payload }) {
    const user = normalizeUser(reqUser);
    if (!user) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const subscriptionSnapshot = await SubscriptionService.getUserSnapshot(user);
    const targetColumns = {
      post: 'post_id',
      comment: 'comment_id',
      question: 'question_id',
    };

    const targetTable = {
      post: 'community_posts',
      comment: 'community_comments',
      question: 'session_questions',
    }[payload.target_type];

    const targetColumn = targetColumns[payload.target_type];
    const targetRow =
      payload.target_type === 'post'
        ? await getPostRowById(db, payload.target_id, user.id)
        : payload.target_type === 'comment'
          ? await getCommentRowById(db, payload.target_id, user.id)
          : await getSessionQuestionRowById(db, payload.target_id);

    if (!targetRow) {
      throw httpError(404, 'Report target not found', 'COMMUNITY_REPORT_TARGET_NOT_FOUND');
    }

    if (payload.target_type === 'post') {
      if (targetRow.deleted_at || targetRow.status !== 'published') {
        throw httpError(404, 'Report target not found', 'COMMUNITY_REPORT_TARGET_NOT_FOUND');
      }
    } else if (payload.target_type === 'comment') {
      if (
        targetRow.deleted_at ||
        targetRow.status !== 'published' ||
        targetRow.post_deleted_at ||
        targetRow.post_status !== 'published'
      ) {
        throw httpError(404, 'Report target not found', 'COMMUNITY_REPORT_TARGET_NOT_FOUND');
      }
    } else if (targetRow.deleted_at) {
      throw httpError(404, 'Report target not found', 'COMMUNITY_REPORT_TARGET_NOT_FOUND');
    }

    const context = mapContext(targetRow);
    if (!isContextReadable(context, user, subscriptionSnapshot)) {
      throw httpError(403, 'Access denied for this community target', 'COMMUNITY_ACCESS_DENIED');
    }

    const existingResult = await db.query(
      `
        SELECT id
        FROM community_reports
        WHERE reporter_id = $1
          AND ${targetColumn} = $2
          AND status = 'pending'
        LIMIT 1
      `,
      [user.id, payload.target_id]
    );

    if (existingResult.rows[0]) {
      throw httpError(409, 'You already reported this content', 'COMMUNITY_REPORT_DUPLICATE');
    }

    const result = await db.query(
      `
        INSERT INTO community_reports (
          reporter_id,
          target_type,
          ${targetColumn},
          reason_code,
          note
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [user.id, payload.target_type, payload.target_id, payload.reason_code, payload.note || null]
    );

    return { report: mapReport(result.rows[0]) };
  }

  static async listSessionQuestions({ reqUser, contextId, status, cursor, limit = 20 }) {
    const user = normalizeUser(reqUser);
    const subscriptionSnapshot = user ? await SubscriptionService.getUserSnapshot(user) : null;
    const context = await getContextById(db, contextId);

    if (!context) {
      throw httpError(404, 'Community context not found', 'COMMUNITY_CONTEXT_NOT_FOUND');
    }
    if (!SESSION_CONTEXT_TYPES.has(context.context_type)) {
      throw httpError(400, 'This context does not support session questions', 'SESSION_QUESTION_CONTEXT_INVALID');
    }
    if (!isContextReadable(context, user, subscriptionSnapshot)) {
      throw httpError(403, 'Access denied for this community context', 'COMMUNITY_ACCESS_DENIED');
    }

    const parsedCursor = parseCursor(cursor);
    const params = [contextId];
    const where = ['q.context_id = $1', 'q.deleted_at IS NULL'];

    if (status) {
      where.push(`q.status = ${addParam(params, status)}`);
    }

    if (parsedCursor) {
      const tsParam = addParam(params, parsedCursor.timestamp);
      const idParam = addParam(params, parsedCursor.id);
      where.push(`(q.created_at < ${tsParam} OR (q.created_at = ${tsParam} AND q.id < ${idParam}))`);
    }

    const normalizedLimit = Math.min(Math.max(limit, 1), 50);
    const limitParam = addParam(params, normalizedLimit + 1);
    const result = await db.query(
      `
        SELECT
          q.*,
          ctx.id AS context_id,
          ctx.context_type,
          ctx.source_system,
          ctx.source_id,
          ctx.slug AS context_slug,
          ctx.title AS context_title,
          ctx.subtitle AS context_subtitle,
          ctx.description AS context_description,
          ctx.visibility AS context_visibility,
          ctx.membership_rule AS context_membership_rule,
          ctx.metadata AS context_metadata,
          ctx.is_active AS context_is_active,
          asker.full_name AS asked_by_name,
          addressed.full_name AS addressed_to_name,
          answered.full_name AS answered_by_name
        FROM session_questions q
        JOIN community_contexts ctx ON ctx.id = q.context_id
        LEFT JOIN profiles asker ON asker.id = q.asked_by_id
        LEFT JOIN profiles addressed ON addressed.id = q.addressed_to_id
        LEFT JOIN profiles answered ON answered.id = q.answered_by_id
        WHERE ${where.join('\n          AND ')}
        ORDER BY q.created_at DESC, q.id DESC
        LIMIT ${limitParam}
      `,
      params
    );

    const rows = result.rows.slice(0, normalizedLimit);
    const nextRow = result.rows.length > normalizedLimit ? rows[rows.length - 1] : null;

    return {
      items: rows.map((row) => mapQuestion(row, user, subscriptionSnapshot)),
      next_cursor: nextRow ? buildCursor(nextRow.created_at, nextRow.id) : null,
    };
  }

  static async createSessionQuestion({ reqUser, payload }) {
    const user = normalizeUser(reqUser);
    if (!user) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const subscriptionSnapshot = await SubscriptionService.getUserSnapshot(user);
    const context = await getContextById(db, payload.context_id);
    if (!context) {
      throw httpError(404, 'Community context not found', 'COMMUNITY_CONTEXT_NOT_FOUND');
    }
    if (!SESSION_CONTEXT_TYPES.has(context.context_type)) {
      throw httpError(400, 'This context does not support session questions', 'SESSION_QUESTION_CONTEXT_INVALID');
    }
    if (!isContextWritable(context, user, 'question', subscriptionSnapshot)) {
      throw httpError(403, 'You cannot ask questions in this context', 'COMMUNITY_ACCESS_DENIED');
    }

    const result = await db.query(
      `
        INSERT INTO session_questions (
          context_id,
          asked_by_id,
          addressed_to_id,
          body,
          is_anonymous
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        payload.context_id,
        user.id,
        payload.addressed_to_id || null,
        payload.body.trim(),
        Boolean(payload.is_anonymous),
      ]
    );

    const questionRow = await getSessionQuestionRowById(db, result.rows[0].id);
    return { question: mapQuestion(questionRow, user, subscriptionSnapshot) };
  }

  static async getProfileSummary({ reqUser, userId }) {
    const viewer = normalizeUser(reqUser);
    const profileResult = await db.query(
      `
        SELECT
          u.id,
          u.email,
          p.full_name,
          p.avatar_url,
          p.bio,
          p.country
        FROM users u
        LEFT JOIN profiles p ON p.id = u.id
        WHERE u.id = $1
        LIMIT 1
      `,
      [userId]
    );

    const profile = profileResult.rows[0];
    if (!profile) {
      throw httpError(404, 'User profile not found', 'USER_PROFILE_NOT_FOUND');
    }

    const [countsResult, activityResult] = await Promise.all([
      db.query(
        `
          SELECT
            (SELECT COUNT(*)::int FROM community_posts WHERE author_id = $1 AND deleted_at IS NULL AND status <> 'deleted') AS posts_count,
            (SELECT COUNT(*)::int FROM community_comments WHERE author_id = $1 AND deleted_at IS NULL AND status <> 'deleted') AS comments_count,
            (SELECT COUNT(*)::int FROM session_questions WHERE asked_by_id = $1 AND deleted_at IS NULL) AS questions_count
        `,
        [userId]
      ),
      db.query(
        `
          SELECT *
          FROM (
            SELECT 'post'::text AS activity_type, id::text AS entity_id, created_at, COALESCE(title, LEFT(body, 120)) AS preview
            FROM community_posts
            WHERE author_id = $1 AND deleted_at IS NULL AND status = 'published'
            UNION ALL
            SELECT 'comment'::text AS activity_type, id::text AS entity_id, created_at, LEFT(body, 120) AS preview
            FROM community_comments
            WHERE author_id = $1 AND deleted_at IS NULL AND status = 'published'
            UNION ALL
            SELECT 'question'::text AS activity_type, id::text AS entity_id, created_at, LEFT(body, 120) AS preview
            FROM session_questions
            WHERE asked_by_id = $1 AND deleted_at IS NULL
          ) activity
          ORDER BY created_at DESC
          LIMIT 15
        `,
        [userId]
      ),
    ]);

    return {
      profile: {
        id: profile.id,
        full_name: profile.full_name || profile.email,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        country: profile.country,
        viewer_is_self: viewer?.id === profile.id,
      },
      counts: countsResult.rows[0],
      recent_activity: activityResult.rows,
    };
  }

  static async listReports({ status, targetType, limit = 50, offset = 0 }) {
    const params = [];
    const where = ['1 = 1'];

    if (status) {
      where.push(`r.status = ${addParam(params, status)}`);
    }
    if (targetType) {
      where.push(`r.target_type = ${addParam(params, targetType)}`);
    }

    const limitParam = addParam(params, Math.min(Math.max(limit, 1), 100));
    const offsetParam = addParam(params, Math.max(offset, 0));

    const result = await db.query(
      `
        SELECT
          r.*,
          reporter.full_name AS reporter_name,
          assignee.full_name AS assigned_to_name,
          COALESCE(cp.title, LEFT(cc.body, 120), LEFT(sq.body, 120)) AS target_preview
        FROM community_reports r
        LEFT JOIN profiles reporter ON reporter.id = r.reporter_id
        LEFT JOIN profiles assignee ON assignee.id = r.assigned_to
        LEFT JOIN community_posts cp ON cp.id = r.post_id
        LEFT JOIN community_comments cc ON cc.id = r.comment_id
        LEFT JOIN session_questions sq ON sq.id = r.question_id
        WHERE ${where.join('\n          AND ')}
        ORDER BY r.created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params
    );

    return result.rows;
  }

  static async listAdminContexts() {
    await ensureGeneralContext();
    const result = await db.query('SELECT * FROM community_contexts ORDER BY created_at DESC');
    return result.rows.map((row) => mapContext(row));
  }

  static async listAdminPosts({ status, contextId, limit = 50, offset = 0 }) {
    await ensureGeneralContext();

    const params = [];
    const where = ['1 = 1'];

    if (status) {
      where.push(`p.status = ${addParam(params, status)}`);
    }

    if (contextId) {
      where.push(
        `EXISTS (
          SELECT 1
          FROM community_post_scopes cps_filter
          WHERE cps_filter.post_id = p.id
            AND cps_filter.context_id = ${addParam(params, contextId)}
        )`
      );
    }

    const countResult = await db.query(
      `
        SELECT COUNT(*)::int AS total
        FROM community_posts p
        WHERE ${where.join('\n          AND ')}
      `,
      params
    );

    const queryParams = [...params];
    const limitParam = addParam(queryParams, Math.min(Math.max(limit, 1), 100));
    const offsetParam = addParam(queryParams, Math.max(offset, 0));

    const result = await db.query(
      `
        SELECT
          p.*,
          ctx.id AS context_id,
          ctx.context_type,
          ctx.source_system,
          ctx.source_id,
          ctx.slug AS context_slug,
          ctx.title AS context_title,
          ctx.subtitle AS context_subtitle,
          ctx.description AS context_description,
          ctx.visibility AS context_visibility,
          ctx.membership_rule AS context_membership_rule,
          ctx.metadata AS context_metadata,
          ctx.is_active AS context_is_active,
          pr.full_name AS author_name,
          pr.avatar_url AS author_avatar_url,
          FALSE AS viewer_liked,
          COALESCE(report_counts.pending_reports_count, 0)::int AS pending_reports_count,
          pin.id AS pin_id,
          pin.sort_order AS pin_sort_order,
          pin.ends_at AS pin_ends_at
        FROM community_posts p
        JOIN community_contexts ctx ON ctx.id = p.primary_context_id
        LEFT JOIN profiles pr ON pr.id = p.author_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS pending_reports_count
          FROM community_reports r
          WHERE r.post_id = p.id
            AND r.status = 'pending'
        ) report_counts ON TRUE
        LEFT JOIN LATERAL (
          SELECT cpin.id, cpin.sort_order, cpin.ends_at
          FROM community_pins cpin
          WHERE cpin.post_id = p.id
            AND cpin.context_id = p.primary_context_id
          ORDER BY cpin.created_at DESC
          LIMIT 1
        ) pin ON TRUE
        WHERE ${where.join('\n          AND ')}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      queryParams
    );

    return {
      items: result.rows.map((row) => mapAdminPost(row)),
      total: countResult.rows[0]?.total || 0,
      limit: Math.min(Math.max(limit, 1), 100),
      offset: Math.max(offset, 0),
    };
  }

  static async listPins({ contextId, limit = 50, offset = 0 }) {
    const params = [];
    const where = ['1 = 1'];

    if (contextId) {
      where.push(`cp.context_id = ${addParam(params, contextId)}`);
    }

    const countResult = await db.query(
      `
        SELECT COUNT(*)::int AS total
        FROM community_pins cp
        WHERE ${where.join('\n          AND ')}
      `,
      params
    );

    const queryParams = [...params];
    const limitParam = addParam(queryParams, Math.min(Math.max(limit, 1), 100));
    const offsetParam = addParam(queryParams, Math.max(offset, 0));

    const result = await db.query(
      `
        SELECT
          cp.*,
          ctx.title AS context_title,
          post.title AS post_title,
          p.full_name AS pinned_by_name
        FROM community_pins cp
        JOIN community_contexts ctx ON ctx.id = cp.context_id
        JOIN community_posts post ON post.id = cp.post_id
        LEFT JOIN profiles p ON p.id = cp.pinned_by
        WHERE ${where.join('\n          AND ')}
        ORDER BY ctx.title ASC, cp.sort_order ASC, cp.created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      queryParams
    );

    return {
      items: result.rows.map((row) => mapPin(row)),
      total: countResult.rows[0]?.total || 0,
      limit: Math.min(Math.max(limit, 1), 100),
      offset: Math.max(offset, 0),
    };
  }

  static async upsertContext(payload) {
    const result = await db.query(
      `
        INSERT INTO community_contexts (
          context_type,
          source_system,
          source_id,
          slug,
          title,
          subtitle,
          description,
          visibility,
          membership_rule,
          metadata,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
        ON CONFLICT (context_type, source_system, source_id)
        DO UPDATE SET
          slug = EXCLUDED.slug,
          title = EXCLUDED.title,
          subtitle = EXCLUDED.subtitle,
          description = EXCLUDED.description,
          visibility = EXCLUDED.visibility,
          membership_rule = EXCLUDED.membership_rule,
          metadata = EXCLUDED.metadata,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        RETURNING *
      `,
      [
        payload.context_type,
        payload.source_system,
        payload.source_id,
        payload.slug,
        payload.title,
        payload.subtitle || null,
        payload.description || null,
        payload.visibility || 'authenticated',
        JSON.stringify(payload.membership_rule || {}),
        JSON.stringify(payload.metadata || {}),
        payload.is_active !== false,
      ]
    );

    return mapContext(result.rows[0]);
  }

  static async updateContext(contextId, payload) {
    const fields = [];
    const params = [];

    if (payload.slug !== undefined) fields.push(`slug = ${addParam(params, payload.slug)}`);
    if (payload.title !== undefined) fields.push(`title = ${addParam(params, payload.title)}`);
    if (payload.subtitle !== undefined) fields.push(`subtitle = ${addParam(params, payload.subtitle || null)}`);
    if (payload.description !== undefined) fields.push(`description = ${addParam(params, payload.description || null)}`);
    if (payload.visibility !== undefined) fields.push(`visibility = ${addParam(params, payload.visibility)}`);
    if (payload.membership_rule !== undefined) fields.push(`membership_rule = ${addParam(params, JSON.stringify(payload.membership_rule || {}))}::jsonb`);
    if (payload.metadata !== undefined) fields.push(`metadata = ${addParam(params, JSON.stringify(payload.metadata || {}))}::jsonb`);
    if (payload.is_active !== undefined) fields.push(`is_active = ${addParam(params, Boolean(payload.is_active))}`);

    if (fields.length === 0) {
      throw httpError(400, 'No context fields supplied', 'COMMUNITY_CONTEXT_EMPTY_PATCH');
    }

    const idParam = addParam(params, contextId);
    const result = await db.query(
      `
        UPDATE community_contexts
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = ${idParam}
        RETURNING *
      `,
      params
    );

    if (!result.rows[0]) {
      throw httpError(404, 'Community context not found', 'COMMUNITY_CONTEXT_NOT_FOUND');
    }

    return mapContext(result.rows[0]);
  }

  static async applyModerationAction({ actor, payload }) {
    const normalizedActor = normalizeUser(actor);
    const tableName = MODERATION_TARGET_TABLES[payload.target_type];

    if (!tableName) {
      throw httpError(400, 'Unsupported moderation target', 'COMMUNITY_MODERATION_TARGET_INVALID');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const targetResult = await client.query(`SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`, [payload.target_id]);
      const target = targetResult.rows[0];

      if (!target) {
        throw httpError(404, 'Moderation target not found', 'COMMUNITY_MODERATION_TARGET_NOT_FOUND');
      }

      switch (payload.action_type) {
        case 'hide':
          await client.query(`UPDATE ${tableName} SET status = 'hidden', updated_at = NOW() WHERE id = $1`, [payload.target_id]);
          break;
        case 'unhide':
          await client.query(`UPDATE ${tableName} SET status = 'published', updated_at = NOW() WHERE id = $1`, [payload.target_id]);
          break;
        case 'delete':
          await client.query(
            `UPDATE ${tableName}
             SET status = 'deleted',
                 deleted_at = NOW(),
                 deleted_by = $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [payload.target_id, normalizedActor.id]
          );
          break;
        case 'restore':
          await client.query(
            `UPDATE ${tableName}
             SET status = 'published',
                 deleted_at = NULL,
                 deleted_by = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [payload.target_id]
          );
          break;
        case 'lock':
          if (payload.target_type !== 'post') {
            throw httpError(400, 'Only posts can be locked', 'COMMUNITY_MODERATION_ACTION_INVALID');
          }
          await client.query(`UPDATE community_posts SET is_locked = TRUE, updated_at = NOW() WHERE id = $1`, [payload.target_id]);
          break;
        case 'unlock':
          if (payload.target_type !== 'post') {
            throw httpError(400, 'Only posts can be unlocked', 'COMMUNITY_MODERATION_ACTION_INVALID');
          }
          await client.query(`UPDATE community_posts SET is_locked = FALSE, updated_at = NOW() WHERE id = $1`, [payload.target_id]);
          break;
        default:
          throw httpError(400, 'Unsupported moderation action', 'COMMUNITY_MODERATION_ACTION_INVALID');
      }

      await client.query(
        `
          INSERT INTO moderation_actions (
            actor_id,
            action_type,
            target_type,
            ${payload.target_type}_id,
            report_id,
            reason,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
        [
          normalizedActor.id,
          payload.action_type,
          payload.target_type,
          payload.target_id,
          payload.report_id || null,
          payload.reason || null,
          JSON.stringify({ target_status_before: target.status || null }),
        ]
      );

      if (payload.report_id) {
        await client.query(
          `
            UPDATE community_reports
            SET status = 'resolved',
                resolved_at = NOW(),
                resolution_note = COALESCE($2, resolution_note),
                updated_at = NOW()
            WHERE id = $1
          `,
          [payload.report_id, payload.reason || null]
        );
      }

      await client.query('COMMIT');
      return {
        action_type: payload.action_type,
        target_type: payload.target_type,
        target_id: payload.target_id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async createPin({ actor, payload }) {
    const normalizedActor = normalizeUser(actor);
    const [context, postScopesResult] = await Promise.all([
      getContextById(db, payload.context_id),
      db.query(
        `
          SELECT 1
          FROM community_post_scopes
          WHERE post_id = $1 AND context_id = $2
          LIMIT 1
        `,
        [payload.post_id, payload.context_id]
      ),
    ]);

    if (!context) {
      throw httpError(404, 'Community context not found', 'COMMUNITY_CONTEXT_NOT_FOUND');
    }
    if (!postScopesResult.rows[0]) {
      throw httpError(400, 'Post is not attached to this context', 'COMMUNITY_PIN_SCOPE_MISMATCH');
    }

    const result = await db.query(
      `
        INSERT INTO community_pins (
          context_id,
          post_id,
          pinned_by,
          reason,
          sort_order,
          ends_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (context_id, post_id)
        DO UPDATE SET
          reason = EXCLUDED.reason,
          sort_order = EXCLUDED.sort_order,
          ends_at = EXCLUDED.ends_at
        RETURNING *
      `,
      [
        payload.context_id,
        payload.post_id,
        normalizedActor.id,
        payload.reason || null,
        payload.sort_order || 0,
        payload.ends_at || null,
      ]
    );

    return { pin: result.rows[0] };
  }

  static async deletePin(pinId) {
    const result = await db.query('DELETE FROM community_pins WHERE id = $1 RETURNING *', [pinId]);
    if (!result.rows[0]) {
      throw httpError(404, 'Pin not found', 'COMMUNITY_PIN_NOT_FOUND');
    }
    return { pin: result.rows[0] };
  }

  static async updateSessionQuestion({ actor, questionId, payload }) {
    const normalizedActor = normalizeUser(actor);
    const subscriptionSnapshot = normalizedActor ? await SubscriptionService.getUserSnapshot(normalizedActor) : null;
    const result = await db.query(
      `
        SELECT
          q.*,
          ctx.id AS context_id,
          ctx.context_type,
          ctx.source_system,
          ctx.source_id,
          ctx.slug AS context_slug,
          ctx.title AS context_title,
          ctx.subtitle AS context_subtitle,
          ctx.description AS context_description,
          ctx.visibility AS context_visibility,
          ctx.membership_rule AS context_membership_rule,
          ctx.metadata AS context_metadata,
          ctx.is_active AS context_is_active
        FROM session_questions q
        JOIN community_contexts ctx ON ctx.id = q.context_id
        WHERE q.id = $1
        LIMIT 1
      `,
      [questionId]
    );

    const question = result.rows[0];
    if (!question) {
      throw httpError(404, 'Session question not found', 'SESSION_QUESTION_NOT_FOUND');
    }

    const isPrivileged = hasPrivilegedRole(normalizedActor);
    const canManage = canManageSessionQuestion(
      mapContext(question),
      question,
      normalizedActor,
      subscriptionSnapshot
    );
    if (!canManage) {
      throw httpError(403, 'You cannot manage this question', 'COMMUNITY_ACCESS_DENIED');
    }

    const fields = [];
    const params = [];

    if (payload.addressed_to_id !== undefined) {
      fields.push(`addressed_to_id = ${addParam(params, payload.addressed_to_id || null)}`);
    }
    if (payload.answer_text !== undefined) {
      fields.push(`answer_text = ${addParam(params, payload.answer_text || null)}`);
      fields.push(`answered_by_id = ${addParam(params, normalizedActor.id)}`);
      fields.push('answered_at = NOW()');
      fields.push(`status = ${addParam(params, 'answered')}`);
    }
    if (payload.status !== undefined) {
      const privilegedStatuses = new Set(['approved', 'rejected', 'archived']);
      if (privilegedStatuses.has(payload.status) && !isPrivileged) {
        throw httpError(403, 'Moderator access is required for this action', 'COMMUNITY_ACCESS_DENIED');
      }

      fields.push(`status = ${addParam(params, payload.status)}`);

      if (payload.status === 'approved') {
        fields.push(`approved_by_id = ${addParam(params, normalizedActor.id)}`);
        fields.push('approved_at = NOW()');
      }
      if (payload.status === 'rejected') {
        fields.push(`rejected_reason = ${addParam(params, payload.rejected_reason || null)}`);
      }
    }

    if (fields.length === 0) {
      throw httpError(400, 'No question changes supplied', 'SESSION_QUESTION_EMPTY_PATCH');
    }

    const idParam = addParam(params, questionId);
    const updateResult = await db.query(
      `
        UPDATE session_questions
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = ${idParam}
        RETURNING *
      `,
      params
    );

    const refreshedQuestion = await getSessionQuestionRowById(db, updateResult.rows[0].id);
    return { question: mapQuestion(refreshedQuestion, normalizedActor, subscriptionSnapshot) };
  }
}

module.exports = CommunityService;
