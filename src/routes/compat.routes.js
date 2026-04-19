/**
 * STEP 7 legacy bridge:
 * This route exists only to preserve transitional Supabase-shaped clients.
 * It is not a source of truth for subscriptions, access decisions, or new product logic.
 * New backend work must use explicit domain routes/services instead of extending this file.
 */
const express = require('express');
const { Readable } = require('stream');
const db = require('../db');
const env = require('../config/env');
const { authenticateUser, optionalAuthenticateUser } = require('../middlewares/auth');
const SubscriptionService = require('../services/subscription.service');

const router = express.Router();

const DAILY_TADABBUR_LIMIT = 20;
const PAYPAL_API_URL = 'https://api-m.paypal.com';
const PRIVILEGED_ROLES = new Set(['admin', 'moderator']);

const VIEW_SOURCES = {
  profiles_public: `
    (
      SELECT
        id,
        full_name,
        avatar_url,
        bio,
        country,
        experience_years,
        is_public_profile,
        is_sudan_awareness_member,
        specializations,
        created_at
      FROM profiles
      WHERE COALESCE(is_public_profile, false) = true
    )
  `,
  course_ratings_public: `
    (
      SELECT course_id, rating, created_at
      FROM course_ratings
    )
  `,
  course_subscriptions_public: `
    (
      SELECT course_id, COUNT(*)::int AS subscriber_count
      FROM course_subscriptions
      GROUP BY course_id
    )
  `,
};

const TABLE_CONFIG = {
  blog_posts: { publicRead: true, ownerColumn: 'author_id' },
  certificates: { publicRead: true, ownerColumn: 'user_id' },
  chat_usage: { publicRead: false, ownerColumn: 'user_id' },
  comments: { publicRead: true, ownerColumn: 'author_id' },
  contents: { publicRead: true, adminWrite: true },
  course_chat_messages: { publicRead: false, ownerColumn: 'user_id', authRead: true },
  course_comments: { publicRead: true, ownerColumn: 'author_id' },
  course_progress: { publicRead: false, ownerColumn: 'user_id' },
  course_ratings: { publicRead: true, ownerColumn: 'user_id' },
  course_ratings_public: { publicRead: true, readOnly: true },
  course_subscriptions: { publicRead: true, ownerColumn: 'user_id' },
  course_subscriptions_public: { publicRead: true, readOnly: true },
  device_tokens: { publicRead: false, ownerColumn: 'user_id' },
  direct_messages: {
    publicRead: false,
    ownerColumn: 'sender_id',
    participantColumns: ['sender_id', 'receiver_id'],
  },
  monthly_subscriptions: { publicRead: false, ownerColumn: 'user_id' },
  notifications: { publicRead: false, ownerColumn: 'user_id' },
  pinned_content: { publicRead: true, adminWrite: true },
  post_reports: { publicRead: false, ownerColumn: 'reporter_id' },
  posts: { publicRead: true, ownerColumn: 'author_id' },
  profiles: { publicRead: true, ownerColumn: 'id' },
  profiles_public: { publicRead: true, readOnly: true },
  reactions: { publicRead: true, ownerColumn: 'user_id' },
  room_messages: { publicRead: true, ownerColumn: 'user_id', authWrite: true },
  room_recordings: { publicRead: true, authWrite: true, specialOwnerCheck: 'roomRecordings' },
  rooms: { publicRead: true, ownerColumn: 'host_id' },
  service_bookings: {
    publicRead: false,
    ownerColumn: 'student_id',
    participantColumns: ['student_id', 'trainer_id'],
  },
  service_reviews: { publicRead: true, ownerColumn: 'student_id' },
  trainer_availability: { publicRead: true, ownerColumn: 'trainer_id' },
  trainer_blocked_dates: { publicRead: true, ownerColumn: 'trainer_id' },
  trainer_courses: { publicRead: true, ownerColumn: 'trainer_id' },
  trainer_services: { publicRead: true, ownerColumn: 'trainer_id' },
  user_roles: { publicRead: false, ownerColumn: 'user_id', adminWrite: true },
  workshop_messages: { publicRead: true, ownerColumn: 'user_id', authWrite: true },
  workshop_participants: { publicRead: true, ownerColumn: 'user_id' },
  workshop_recordings: { publicRead: true, authWrite: true, specialOwnerCheck: 'workshopRecordings' },
  workshops: { publicRead: true, ownerColumn: 'host_id' },
};

const TABLE_ORDER = Object.keys(TABLE_CONFIG).sort();

const TADABBUR_SYSTEM_PROMPT = `أنت "مساعد التدبر" ومعلم متخصص في اللسان العربي المبين.

التزم بما يلي:
- أجب بالعربية الفصحى الواضحة.
- اشرح الجذر والمعنى اللغوي ثم السياق القرآني عند اللزوم.
- اجعل الإجابة مبسطة للمبتدئ ومركزة وعملية.
- تجنب الادعاءات غير الموثقة، واذكر حين تكون بصدد استنتاج.
- لا تخرج عن دورك التعليمي في اللغة والتدبر.`;

function isPrivileged(user) {
  return Boolean(user?.roles?.some((role) => PRIVILEGED_ROLES.has(role)));
}

function isColumnName(value) {
  return typeof value === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

function getTableConfig(table) {
  return TABLE_CONFIG[table] || null;
}

function getSourceSql(table) {
  if (Object.prototype.hasOwnProperty.call(VIEW_SOURCES, table)) {
    return `${VIEW_SOURCES[table]} AS t`;
  }

  return `${table} AS t`;
}

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}

function addParam(params, value) {
  params.push(value);
  return `$${params.length}`;
}

function parseOrExpression(expression) {
  if (typeof expression !== 'string' || !expression.trim()) {
    return [];
  }

  const groups = [];
  const matches = expression.match(/and\(([^)]+)\)/g);

  for (const group of matches || []) {
    const raw = group.slice(4, -1);
    const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
    const conditions = [];

    for (const part of parts) {
      const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|gte|gt|lte|lt|ilike)\.(.+)$/);
      if (!match) {
        continue;
      }

      conditions.push({
        column: match[1],
        operator: match[2],
        value: decodeURIComponent(match[3]),
      });
    }

    if (conditions.length) {
      groups.push(conditions);
    }
  }

  return groups;
}

function appendScalarCondition(conditions, params, filter) {
  if (!isColumnName(filter.column)) {
    return;
  }

  const column = `t.${filter.column}`;
  const operator = filter.operator;

  if (operator === 'eq') {
    conditions.push(`${column} = ${addParam(params, filter.value)}`);
    return;
  }

  if (operator === 'ilike') {
    conditions.push(`${column} ILIKE ${addParam(params, filter.value)}`);
    return;
  }

  if (operator === 'gt') {
    conditions.push(`${column} > ${addParam(params, filter.value)}`);
    return;
  }

  if (operator === 'gte') {
    conditions.push(`${column} >= ${addParam(params, filter.value)}`);
    return;
  }

  if (operator === 'lt') {
    conditions.push(`${column} < ${addParam(params, filter.value)}`);
    return;
  }

  if (operator === 'lte') {
    conditions.push(`${column} <= ${addParam(params, filter.value)}`);
    return;
  }

  if (operator === 'in' && Array.isArray(filter.value) && filter.value.length > 0) {
    conditions.push(`${column} = ANY(${addParam(params, filter.value)})`);
    return;
  }

  if (operator === 'not' && filter.notOperator === 'is') {
    if (filter.value === null) {
      conditions.push(`${column} IS NOT NULL`);
      return;
    }

    conditions.push(`${column} IS DISTINCT FROM ${addParam(params, filter.value)}`);
  }
}

function buildWhereClause({ filters = [], orFilters = [], implicitConditions = [], params = [] }) {
  const conditions = [...implicitConditions];

  for (const filter of filters) {
    appendScalarCondition(conditions, params, filter);
  }

  if (Array.isArray(orFilters) && orFilters.length > 0) {
    const groupSql = [];

    for (const group of orFilters) {
      const nested = [];
      for (const condition of group) {
        const nestedBefore = nested.length;
        appendScalarCondition(nested, params, condition);
        if (nested.length === nestedBefore) {
          continue;
        }
      }

      if (nested.length > 0) {
        groupSql.push(`(${nested.join(' AND ')})`);
      }
    }

    if (groupSql.length > 0) {
      conditions.push(`(${groupSql.join(' OR ')})`);
    }
  }

  return conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
}

function getImplicitReadConditions(table, user, params) {
  if (table === 'notifications' || table === 'device_tokens' || table === 'monthly_subscriptions' || table === 'chat_usage') {
    if (!user?.id) {
      throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
    }

    return [`t.user_id = ${addParam(params, user.id)}`];
  }

  if (table === 'course_progress') {
    if (!user?.id) {
      throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
    }

    return [`t.user_id = ${addParam(params, user.id)}`];
  }

  if (table === 'user_roles' && !isPrivileged(user)) {
    if (!user?.id) {
      throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
    }

    return [`t.user_id = ${addParam(params, user.id)}`];
  }

  if (table === 'direct_messages') {
    if (!user?.id) {
      throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
    }

    const token = addParam(params, user.id);
    return [`(t.sender_id = ${token} OR t.receiver_id = ${token})`];
  }

  if (table === 'service_bookings') {
    if (!user?.id) {
      throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
    }

    const token = addParam(params, user.id);
    return [`(t.student_id = ${token} OR t.trainer_id = ${token})`];
  }

  if (table === 'course_chat_messages') {
    if (!user?.id) {
      throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
    }
  }

  return [];
}

function applyInsertOwnership(table, payload, user) {
  const config = getTableConfig(table);

  if (!config) {
    throw Object.assign(new Error('Unsupported table.'), { statusCode: 400 });
  }

  if (config.adminWrite && !isPrivileged(user)) {
    throw Object.assign(new Error('Admin privileges are required.'), { statusCode: 403 });
  }

  if ((config.ownerColumn || config.authWrite || config.participantColumns) && !user?.id) {
    throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  }

  const normalized = { ...(payload || {}) };

  if (config.ownerColumn && !isPrivileged(user)) {
    if (normalized[config.ownerColumn] && normalized[config.ownerColumn] !== user.id) {
      throw Object.assign(new Error('You cannot write records for another user.'), { statusCode: 403 });
    }

    normalized[config.ownerColumn] = normalized[config.ownerColumn] || user.id;
  }

  if (config.participantColumns?.length && !isPrivileged(user)) {
    const hasParticipant = config.participantColumns.some((column) => normalized[column] === user.id);
    if (!hasParticipant) {
      throw Object.assign(new Error('You cannot access this record.'), { statusCode: 403 });
    }
  }

  if ((table === 'course_chat_messages' || table === 'workshop_messages' || table === 'room_messages') && !normalized.user_id) {
    normalized.user_id = user.id;
  }

  return normalized;
}

function getImplicitMutationConditions(table, user, params) {
  const config = getTableConfig(table);

  if (!config || isPrivileged(user) || config.adminWrite) {
    return [];
  }

  if (!user?.id) {
    throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  }

  if (config.participantColumns?.length) {
    return [
      `(${config.participantColumns.map((column) => `t.${column} = ${addParam(params, user.id)}`).join(' OR ')})`,
    ];
  }

  if (config.ownerColumn) {
    return [`t.${config.ownerColumn} = ${addParam(params, user.id)}`];
  }

  return [];
}

async function assertMutationAllowed({ table, filters, user }) {
  const config = getTableConfig(table);

  if (!config) {
    throw Object.assign(new Error('Unsupported table.'), { statusCode: 400 });
  }

  if (config.adminWrite && !isPrivileged(user)) {
    throw Object.assign(new Error('Admin privileges are required.'), { statusCode: 403 });
  }

  if (isPrivileged(user)) {
    return;
  }

  if (!user?.id) {
    throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  }

  if (config.specialOwnerCheck) {
    const rowIdFilter = (filters || []).find((filter) => filter.operator === 'eq' && filter.column === 'id');
    if (!rowIdFilter?.value) {
      throw Object.assign(new Error('A concrete record id is required for this action.'), { statusCode: 400 });
    }

    if (config.specialOwnerCheck === 'roomRecordings') {
      const result = await db.query(
        `
          SELECT 1
          FROM room_recordings rr
          INNER JOIN rooms r ON r.id = rr.room_id
          WHERE rr.id = $1
            AND r.host_id = $2
          LIMIT 1
        `,
        [rowIdFilter.value, user.id]
      );

      if (result.rowCount === 0) {
        throw Object.assign(new Error('You do not own this record.'), { statusCode: 403 });
      }

      return;
    }

    if (config.specialOwnerCheck === 'workshopRecordings') {
      const result = await db.query(
        `
          SELECT 1
          FROM workshop_recordings wr
          INNER JOIN workshops w ON w.id = wr.workshop_id
          WHERE wr.id = $1
            AND w.host_id = $2
          LIMIT 1
        `,
        [rowIdFilter.value, user.id]
      );

      if (result.rowCount === 0) {
        throw Object.assign(new Error('You do not own this record.'), { statusCode: 403 });
      }

      return;
    }
  }

  if (config.participantColumns?.length) {
    const params = [];
    const implicit = [
      `(${config.participantColumns.map((column) => `t.${column} = ${addParam(params, user.id)}`).join(' OR ')})`,
    ];
    const where = buildWhereClause({ filters, implicitConditions: implicit, params });
    const result = await db.query(`SELECT 1 FROM ${getSourceSql(table)}${where} LIMIT 1`, params);

    if (result.rowCount === 0) {
      throw Object.assign(new Error('You do not have access to this record.'), { statusCode: 403 });
    }

    return;
  }

  if (config.ownerColumn) {
    const params = [];
    const implicit = [`t.${config.ownerColumn} = ${addParam(params, user.id)}`];
    const where = buildWhereClause({ filters, implicitConditions: implicit, params });
    const result = await db.query(`SELECT 1 FROM ${getSourceSql(table)}${where} LIMIT 1`, params);

    if (result.rowCount === 0) {
      throw Object.assign(new Error('You do not own this record.'), { statusCode: 403 });
    }
  }
}

function buildOrderClause(order = []) {
  const clauses = [];

  for (const item of order) {
    if (!item || !isColumnName(item.column)) {
      continue;
    }

    clauses.push(`t.${item.column} ${item.ascending === false ? 'DESC' : 'ASC'}`);
  }

  return clauses.length ? ` ORDER BY ${clauses.join(', ')}` : '';
}

function normalizeLimit(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function sanitizeTrainerCourseRow(row, user, snapshot) {
  if (!row) {
    return row;
  }

  const canAccessProtectedFields =
    Number(row.price) <= 0 ||
    isPrivileged(user) ||
    row.trainer_id === user?.id ||
    snapshot?.access?.canAccessFullLibrary ||
    snapshot?.access?.hasAdminPlatform ||
    SubscriptionService.canAccessCourse(snapshot, row.id);

  if (canAccessProtectedFields) {
    return row;
  }

  return {
    ...row,
    url: null,
    media_url: null,
  };
}

async function runSelect(req, res) {
  const {
    table,
    filters = [],
    order = [],
    limit,
    offset,
    range,
    single = false,
    maybeSingle = false,
    count = null,
    head = false,
    or = null,
  } = req.body || {};

  const config = getTableConfig(table);
  if (!config) {
    return res.status(400).json({ success: false, error: { message: 'Unsupported table.' } });
  }

  if (!config.publicRead && !config.authRead && !req.user?.id) {
    return res.status(401).json({ success: false, error: { message: 'Authentication required.' } });
  }

  try {
    const params = [];
    const implicit = getImplicitReadConditions(table, req.user, params);
    const orFilters = typeof or === 'string' ? parseOrExpression(or) : [];
    const where = buildWhereClause({ filters, orFilters, implicitConditions: implicit, params });
    const orderClause = buildOrderClause(order);

    let finalLimit = normalizeLimit(limit);
    let finalOffset = normalizeLimit(offset, 0);

    if (Array.isArray(range) && range.length === 2) {
      const start = normalizeLimit(range[0], 0);
      const end = normalizeLimit(range[1], start);
      finalOffset = start;
      finalLimit = Math.max(end - start + 1, 0);
    }

    const sourceSql = getSourceSql(table);
    const countSql = count === 'exact' ? `SELECT COUNT(*)::int AS total FROM ${sourceSql}${where}` : null;
    const selectSql = head
      ? null
      : `SELECT * FROM ${sourceSql}${where}${orderClause}${finalLimit !== null ? ` LIMIT ${finalLimit}` : ''}${finalOffset ? ` OFFSET ${finalOffset}` : ''}`;

    const [countResult, selectResult] = await Promise.all([
      countSql ? db.query(countSql, params) : Promise.resolve(null),
      selectSql ? db.query(selectSql, params) : Promise.resolve({ rows: [] }),
    ]);

    const snapshot = req.user ? await SubscriptionService.getUserSnapshot(req.user) : null;
    let rows = selectResult.rows;

    if (table === 'contents') {
      rows = rows
        .filter((row) => SubscriptionService.isContentAccessible(row, snapshot))
        .map((row) => SubscriptionService.sanitizeProtectedMedia(row, snapshot));
    }

    if (table === 'trainer_courses') {
      rows = rows.map((row) => sanitizeTrainerCourseRow(row, req.user, snapshot));
    }

    const total = countResult?.rows?.[0]?.total ?? null;

    if (single || maybeSingle) {
      const row = rows[0] || null;
      if (single && !row) {
        return res.status(404).json({ success: false, error: { message: 'Record not found.' }, data: null, count: total });
      }

      return res.json({ success: true, data: row, count: total });
    }

    return res.json({ success: true, data: rows, count: total });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { message: error.message || 'Failed to query records.' },
    });
  }
}

function getEqFilterValue(filters, column) {
  const match = (filters || []).find((filter) => filter?.column === column && filter?.operator === 'eq');
  return match?.value || null;
}

function rejectLegacySubscriptionMutation(res, message) {
  return res.status(409).json({
    success: false,
    error: { message },
  });
}

async function runLegacyCourseSubscriptionInsert(req, res) {
  const rows = toArray(req.body?.payload).filter(Boolean);

  if (!rows.length) {
    return res.status(400).json({ success: false, error: { message: 'Insert payload is required.' } });
  }

  try {
    const subscriptions = [];

    for (const row of rows) {
      const courseId = row?.course_id || row?.courseId || null;
      if (!courseId) {
        throw Object.assign(new Error('course_id is required.'), { statusCode: 400 });
      }

      const subscription = await SubscriptionService.grantSubscription({
        actorId: req.user.id,
        userId: req.user.id,
        planCode: 'student',
        source: 'manual',
        metadata: {
          course_id: courseId,
        },
      });

      subscriptions.push({
        id: subscription.id,
        user_id: req.user.id,
        course_id: courseId,
        subscribed_at: subscription.starts_at,
      });
    }

    const data = req.body?.single || req.body?.maybeSingle ? subscriptions[0] || null : subscriptions;
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { message: error.message || 'Insert failed.' },
    });
  }
}

async function runLegacyCourseSubscriptionDelete(req, res) {
  const courseId = getEqFilterValue(req.body?.filters, 'course_id');

  if (!courseId) {
    return res.status(400).json({
      success: false,
      error: { message: 'course_id filter is required for course subscription deletes.' },
    });
  }

  try {
    const subscription = await SubscriptionService.revokeSubscription({
      actorId: req.user?.id || null,
      userId: req.user.id,
      planCode: 'student',
      courseId,
      reason: 'legacy_course_unsubscribe',
    });

    const data = {
      id: subscription.id,
      user_id: req.user.id,
      course_id: courseId,
      subscribed_at: subscription.starts_at,
    };

    return res.json({
      success: true,
      data: req.body?.single || req.body?.maybeSingle ? data : [data],
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { message: error.message || 'Delete failed.' },
    });
  }
}

async function runInsert(req, res) {
  const { table, payload, single = false, maybeSingle = false, onConflict = null } = req.body || {};
  const config = getTableConfig(table);

  if (!config || config.readOnly) {
    return res.status(400).json({ success: false, error: { message: 'Unsupported mutation target.' } });
  }

  if (!req.user?.id) {
    return res.status(401).json({ success: false, error: { message: 'Authentication required.' } });
  }

  if (table === 'course_subscriptions') {
    return runLegacyCourseSubscriptionInsert(req, res);
  }

  if (table === 'monthly_subscriptions') {
    return rejectLegacySubscriptionMutation(
      res,
      'Direct writes to monthly_subscriptions are disabled. Use the subscriptions APIs or payment verification flow.'
    );
  }

  try {
    const rows = toArray(payload).map((item) => applyInsertOwnership(table, item, req.user));
    if (!rows.length) {
      throw Object.assign(new Error('Insert payload is required.'), { statusCode: 400 });
    }

    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(isColumnName);
    const params = [];
    const valuesSql = rows
      .map((row) => {
        const placeholders = columns.map((column) => addParam(params, row[column] ?? null));
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');

    const conflictSql = typeof onConflict === 'string' && onConflict.split(',').every((column) => isColumnName(column.trim()))
      ? ` ON CONFLICT (${onConflict.split(',').map((column) => column.trim()).join(', ')}) DO UPDATE SET ${columns
          .filter((column) => !onConflict.split(',').map((value) => value.trim()).includes(column))
          .map((column) => `${column} = EXCLUDED.${column}`)
          .join(', ')}`
      : '';

    const result = await db.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuesSql}${conflictSql} RETURNING *`,
      params
    );

    const data = single || maybeSingle ? result.rows[0] || null : result.rows;
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { message: error.message || 'Insert failed.' },
    });
  }
}

async function runUpdate(req, res) {
  const { table, payload, filters = [], single = false, maybeSingle = false } = req.body || {};
  const config = getTableConfig(table);

  if (!config || config.readOnly) {
    return res.status(400).json({ success: false, error: { message: 'Unsupported mutation target.' } });
  }

  if (table === 'course_subscriptions' || table === 'monthly_subscriptions') {
    return rejectLegacySubscriptionMutation(
      res,
      `Direct updates to ${table} are disabled. Use backend-owned subscription APIs instead.`
    );
  }

  try {
    await assertMutationAllowed({ table, filters, user: req.user });

    const updates = Object.entries(payload || {}).filter(([column]) => isColumnName(column));
    if (!updates.length) {
      throw Object.assign(new Error('Update payload is required.'), { statusCode: 400 });
    }

    const params = [];
    const setClause = updates.map(([column, value]) => `${column} = ${addParam(params, value)}`).join(', ');
    const implicit = getImplicitMutationConditions(table, req.user, params);
    const where = buildWhereClause({ filters, implicitConditions: implicit, params });
    const result = await db.query(`UPDATE ${table} AS t SET ${setClause}${where} RETURNING *`, params);
    const data = single || maybeSingle ? result.rows[0] || null : result.rows;

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { message: error.message || 'Update failed.' },
    });
  }
}

async function runDelete(req, res) {
  const { table, filters = [], single = false, maybeSingle = false } = req.body || {};
  const config = getTableConfig(table);

  if (!config || config.readOnly) {
    return res.status(400).json({ success: false, error: { message: 'Unsupported mutation target.' } });
  }

  if (table === 'course_subscriptions') {
    return runLegacyCourseSubscriptionDelete(req, res);
  }

  if (table === 'monthly_subscriptions') {
    return rejectLegacySubscriptionMutation(
      res,
      'Direct deletes from monthly_subscriptions are disabled. Use backend-owned subscription APIs instead.'
    );
  }

  try {
    await assertMutationAllowed({ table, filters, user: req.user });

    const params = [];
    const implicit = getImplicitMutationConditions(table, req.user, params);
    const where = buildWhereClause({ filters, implicitConditions: implicit, params });
    const result = await db.query(`DELETE FROM ${table} AS t${where} RETURNING *`, params);
    const data = single || maybeSingle ? result.rows[0] || null : result.rows;

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { message: error.message || 'Delete failed.' },
    });
  }
}

async function handlePaypalSubscription(req, res) {
  const { action, subscriptionId } = req.body || {};

  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET_KEY) {
    return res.status(500).json({ success: false, error: { message: 'PayPal is not configured.' } });
  }

  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET_KEY}`).toString('base64');
  const tokenResponse = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    return res.status(502).json({ success: false, error: { message: 'Failed to authenticate with PayPal.' } });
  }

  const tokenPayload = await tokenResponse.json();
  const accessToken = tokenPayload.access_token;

  if (action === 'check') {
    const subscription = await SubscriptionService.buildLegacyMonthlySubscription(req.user);
    const active = Boolean(subscription && subscription.expires_at && new Date(subscription.expires_at) > new Date());
    return res.json({ success: true, hasSubscription: active, subscription });
  }

  if (action !== 'verify' || !subscriptionId) {
    return res.status(400).json({ success: false, error: { message: 'Invalid PayPal action.' } });
  }

  const response = await fetch(`${PAYPAL_API_URL}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return res.status(502).json({ success: false, error: { message: 'Failed to verify the subscription.' } });
  }

  const subscriptionData = await response.json();
  const active = subscriptionData.status === 'ACTIVE';

  if (active) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    await SubscriptionService.grantSubscription({
      actorId: req.user.id,
      userId: req.user.id,
      planCode: 'monthly',
      source: 'future_payment',
      provider: 'paypal',
      providerReference: subscriptionId,
      startsAt: new Date().toISOString(),
      endsAt: expiresAt.toISOString(),
      metadata: {
        provider_status: subscriptionData.status,
        provider_payload_id: subscriptionData.id || subscriptionId,
      },
    });
  }

  return res.json({ success: true, active, status: subscriptionData.status });
}

async function ensureWorkshopAccess(workshopId, user) {
  const result = await db.query(
    `
      SELECT 1
      FROM workshops
      WHERE id = $1
        AND (host_id = $2 OR $3 = true)
      LIMIT 1
    `,
    [workshopId, user.id, isPrivileged(user)]
  );

  return result.rowCount > 0;
}

async function handleCloudflareStream(req, res) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    return res.status(500).json({ success: false, error: { message: 'Cloudflare Stream is not configured.' } });
  }

  const { action, workshopId, title, videoUid } = req.body || {};
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream`;
  const headers = {
    Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  if (workshopId && ['create-live-input', 'create-direct-upload', 'delete-live-input'].includes(action)) {
    const allowed = await ensureWorkshopAccess(workshopId, req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, error: { message: 'You do not have permission for this workshop.' } });
    }
  }

  let response;

  if (action === 'create-live-input') {
    response = await fetch(`${baseUrl}/live_inputs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        meta: { name: title || `Workshop ${workshopId}`, workshopId },
        recording: {
          mode: 'automatic',
          timeoutSeconds: 0,
          requireSignedURLs: false,
        },
      }),
    });
  } else if (action === 'get-live-input') {
    response = await fetch(`${baseUrl}/live_inputs/${videoUid}`, { headers });
  } else if (action === 'list-recordings') {
    response = await fetch(`${baseUrl}/live_inputs/${videoUid}/videos`, { headers });
  } else if (action === 'get-video') {
    response = await fetch(`${baseUrl}/${videoUid}`, { headers });
  } else if (action === 'create-direct-upload') {
    response = await fetch(`${baseUrl}?direct_user=true`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        maxDurationSeconds: 7200,
        requireSignedURLs: false,
        meta: { name: title || `Workshop ${workshopId} upload`, workshopId },
      }),
    });
  } else if (action === 'delete-live-input') {
    response = await fetch(`${baseUrl}/live_inputs/${videoUid}`, {
      method: 'DELETE',
      headers,
    });
  } else if (action === 'delete-video') {
    response = await fetch(`${baseUrl}/${videoUid}`, {
      method: 'DELETE',
      headers,
    });
  } else {
    return res.status(400).json({ success: false, error: { message: 'Invalid Cloudflare action.' } });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    return res.status(response.status || 502).json({
      success: false,
      error: { message: payload?.errors?.[0]?.message || payload?.error || 'Cloudflare request failed.' },
    });
  }

  return res.json({ success: true, data: payload.result ?? payload });
}

async function handleTadabburChat(req, res) {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

  if (!messages.length) {
    return res.status(400).json({ success: false, error: { message: 'At least one message is required.' } });
  }

  if (!env.LOVABLE_API_KEY) {
    return res.status(500).json({ success: false, error: { message: 'Tadabbur AI is not configured.' } });
  }

  const subscriptionResult = await db.query(
    `
      SELECT 1
      FROM monthly_subscriptions
      WHERE user_id = $1
        AND status = 'active'
        AND expires_at > NOW()
      LIMIT 1
    `,
    [req.user.id]
  );

  const isSubscriber = subscriptionResult.rowCount > 0;
  let remaining = null;

  if (!isSubscriber) {
    const usageResult = await db.query(
      `
        INSERT INTO chat_usage (user_id, usage_date, message_count)
        VALUES ($1, CURRENT_DATE, 1)
        ON CONFLICT (user_id, usage_date)
        DO UPDATE SET
          message_count = chat_usage.message_count + 1,
          updated_at = NOW()
        RETURNING message_count
      `,
      [req.user.id]
    );

    const used = Number(usageResult.rows[0]?.message_count || 0);
    if (used > DAILY_TADABBUR_LIMIT) {
      return res.status(429).json({
        success: false,
        error: { message: `لقد استنفدت رسائلك اليومية (${DAILY_TADABBUR_LIMIT} رسالة).` },
        limit_reached: true,
        remaining: 0,
        is_subscriber: false,
      });
    }

    remaining = DAILY_TADABBUR_LIMIT - used;
  }

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      stream: true,
      messages: [
        { role: 'system', content: TADABBUR_SYSTEM_PROMPT },
        ...messages.map((message) => ({
          role: message.role,
          content: String(message.content || '').trim(),
        })),
      ],
    }),
  });

  if (!aiResponse.ok || !aiResponse.body) {
    const payload = await aiResponse.json().catch(() => ({}));
    return res.status(aiResponse.status || 502).json({
      success: false,
      error: { message: payload?.error?.message || payload?.message || 'AI gateway request failed.' },
    });
  }

  res.status(aiResponse.status);
  res.setHeader('Content-Type', aiResponse.headers.get('content-type') || 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Usage-Remaining', remaining === null ? '-1' : String(remaining));
  res.setHeader('X-Is-Subscriber', isSubscriber ? 'true' : 'false');

  Readable.fromWeb(aiResponse.body).pipe(res);
}

router.post('/query', optionalAuthenticateUser, async (req, res) => {
  const operation = req.body?.operation || 'select';

  if (!req.body?.table || !TABLE_ORDER.includes(req.body.table)) {
    return res.status(400).json({ success: false, error: { message: 'Unsupported table.' } });
  }

  if (operation === 'select') {
    return runSelect(req, res);
  }

  if (operation === 'insert' || operation === 'upsert') {
    return runInsert(req, res);
  }

  if (operation === 'update') {
    return runUpdate(req, res);
  }

  if (operation === 'delete') {
    return runDelete(req, res);
  }

  return res.status(400).json({ success: false, error: { message: 'Unsupported operation.' } });
});

router.post('/functions/paypal-subscription', authenticateUser, async (req, res) => {
  try {
    await handlePaypalSubscription(req, res);
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message || 'PayPal request failed.' } });
  }
});

router.post('/functions/cloudflare-stream', authenticateUser, async (req, res) => {
  try {
    await handleCloudflareStream(req, res);
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message || 'Cloudflare request failed.' } });
  }
});

router.post('/functions/tadabbur-chat', authenticateUser, async (req, res) => {
  try {
    await handleTadabburChat(req, res);
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message || 'Chat request failed.' } });
  }
});

module.exports = router;
