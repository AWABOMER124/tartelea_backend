const db = require('../db');
const { httpError } = require('../utils/httpError');
const { getPrimaryRole, normalizeRoles } = require('../utils/roles');
const {
  ACCESS_TIERS,
  ENTITLEMENT_CODES,
  ENTITLEMENT_SEEDS,
  FUTURE_PAYMENT_PROVIDERS,
  PLAN_CODES,
  PLAN_SEEDS,
  buildAccessDecisions,
  buildSubscriptionContract,
  canAccessCourse,
  getPrimaryPlanCode,
  getRoleEntitlements,
  getScopedCourseIds,
  mergeEntitlements,
  toSortedUnique,
} = require('../domain/subscriptions');

let catalogReadyPromise = null;

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  if (typeof user === 'string') {
    return {
      id: user,
      roles: [],
      role: 'member',
    };
  }

  const roles = normalizeRoles(user.roles || user.role, {
    fallback: user.id ? 'member' : 'guest',
  });

  return {
    ...user,
    roles,
    role: getPrimaryRole(roles, {
      fallback: user.id ? 'member' : 'guest',
    }),
  };
}

async function ensureCatalogReady(executor = db) {
  if (!catalogReadyPromise) {
    catalogReadyPromise = (async () => {
      for (const entitlement of ENTITLEMENT_SEEDS) {
        await executor.query(
          `
            INSERT INTO subscription_entitlements (code, description)
            VALUES ($1, $2)
            ON CONFLICT (code)
            DO UPDATE SET description = EXCLUDED.description
          `,
          [entitlement.code, entitlement.description]
        );
      }

      for (const plan of PLAN_SEEDS) {
        await executor.query(
          `
            INSERT INTO subscription_plans (
              code,
              name,
              billing_period,
              price,
              currency,
              is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (code)
            DO UPDATE SET
              name = EXCLUDED.name,
              billing_period = EXCLUDED.billing_period,
              price = EXCLUDED.price,
              currency = EXCLUDED.currency,
              is_active = EXCLUDED.is_active,
              updated_at = NOW()
          `,
          [
            plan.code,
            plan.name,
            plan.billing_period,
            plan.price,
            plan.currency,
            plan.is_active !== false,
          ]
        );

        for (const entitlementCode of plan.entitlements) {
          await executor.query(
            `
              INSERT INTO subscription_plan_entitlements (plan_id, entitlement_id)
              SELECT p.id, e.id
              FROM subscription_plans p
              INNER JOIN subscription_entitlements e ON e.code = $2
              WHERE p.code = $1
              ON CONFLICT (plan_id, entitlement_id) DO NOTHING
            `,
            [plan.code, entitlementCode]
          );
        }
      }
    })().catch((error) => {
      catalogReadyPromise = null;
      throw error;
    });
  }

  await catalogReadyPromise;
}

function mapPlanRows(rows = []) {
  const byCode = new Map();

  for (const row of rows) {
    if (!byCode.has(row.code)) {
      byCode.set(row.code, {
        id: row.id,
        code: row.code,
        name: row.name,
        billing_period: row.billing_period,
        price: Number(row.price) || 0,
        currency: row.currency,
        is_active: row.is_active !== false,
        entitlements: [],
      });
    }

    if (row.entitlement_code) {
      byCode.get(row.code).entitlements.push(row.entitlement_code);
    }
  }

  const plans = [...byCode.values()].map((plan) => ({
    ...plan,
    entitlements: toSortedUnique(plan.entitlements),
  }));

  plans.sort((left, right) => {
    if (left.code === right.code) {
      return 0;
    }

    if (left.code === 'free') {
      return -1;
    }
    if (right.code === 'free') {
      return 1;
    }

    return left.code.localeCompare(right.code);
  });

  return plans;
}

async function loadPlanCatalog(executor = db) {
  const result = await executor.query(
    `
      SELECT
        p.id,
        p.code,
        p.name,
        p.billing_period,
        p.price,
        p.currency,
        p.is_active,
        e.code AS entitlement_code
      FROM subscription_plans p
      LEFT JOIN subscription_plan_entitlements ppe
        ON ppe.plan_id = p.id
      LEFT JOIN subscription_entitlements e
        ON e.id = ppe.entitlement_id
      ORDER BY p.code ASC, e.code ASC
    `
  );

  return mapPlanRows(result.rows);
}

async function loadRolesForUser(userId, executor = db) {
  const result = await executor.query(
    `
      SELECT COALESCE(array_remove(array_agg(DISTINCT role::text), NULL), '{}') AS roles
      FROM user_roles
      WHERE user_id = $1
    `,
    [userId]
  );

  return normalizeRoles(result.rows[0]?.roles || [], { fallback: 'member' });
}

async function loadActiveSubscriptions(userId, executor = db) {
  const result = await executor.query(
    `
      SELECT
        id,
        user_id,
        plan_code,
        status,
        starts_at,
        ends_at,
        source,
        provider,
        provider_reference,
        metadata,
        created_by,
        created_at,
        updated_at
      FROM user_subscriptions
      WHERE user_id = $1
        AND status = 'active'
        AND starts_at <= NOW()
        AND (ends_at IS NULL OR ends_at > NOW())
      ORDER BY starts_at DESC, created_at DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    ...row,
    metadata: row.metadata || {},
  }));
}

async function loadActiveOverrides(userId, executor = db) {
  const result = await executor.query(
    `
      SELECT
        id,
        user_id,
        entitlement_code,
        effect,
        reason,
        source,
        starts_at,
        ends_at,
        metadata,
        created_by,
        created_at,
        updated_at
      FROM user_entitlement_overrides
      WHERE user_id = $1
        AND starts_at <= NOW()
        AND (ends_at IS NULL OR ends_at > NOW())
      ORDER BY starts_at DESC, created_at DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    ...row,
    metadata: row.metadata || {},
  }));
}

function buildSnapshot({
  userId,
  roles,
  plans,
  subscriptions,
  overrides,
}) {
  const plansByCode = new Map(plans.map((plan) => [plan.code, plan]));
  const roleEntitlements = getRoleEntitlements(roles);
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active');
  const primaryPlanCode = getPrimaryPlanCode(activeSubscriptions);
  const primarySubscription =
    activeSubscriptions.find((subscription) => subscription.plan_code === primaryPlanCode) || null;

  const planEntitlements = activeSubscriptions.length > 0
    ? toSortedUnique(
        activeSubscriptions.flatMap((subscription) => plansByCode.get(subscription.plan_code)?.entitlements || [])
      )
    : [...(plansByCode.get('free')?.entitlements || [])];

  const overrideGrants = overrides
    .filter((override) => override.effect === 'grant')
    .map((override) => override.entitlement_code);
  const overrideRevokes = overrides
    .filter((override) => override.effect === 'revoke')
    .map((override) => override.entitlement_code);
  const overrideScopedCourses = overrides
    .filter((override) => override.entitlement_code === 'access_specific_course')
    .map((override) => override.metadata?.course_id || override.metadata?.courseId || null)
    .filter(Boolean);

  const scopedCourseIds = getScopedCourseIds(activeSubscriptions, overrideScopedCourses);
  const entitlements = mergeEntitlements({
    planEntitlements,
    roleEntitlements,
    overrideGrants,
    overrideRevokes,
    roles,
  });

  const access = buildAccessDecisions({
    roles,
    entitlements,
    scopedCourseIds,
  });

  return {
    user_id: userId,
    roles,
    primary_plan_code: primaryPlanCode,
    primary_subscription: primarySubscription,
    status: primarySubscription?.status || 'active',
    primary_source: primarySubscription?.source || 'manual',
    entitlements,
    access,
    scoped_course_ids: scopedCourseIds,
    subscriptions: activeSubscriptions,
    overrides,
    plans,
  };
}

function getDefaultEndsAt(planCode, startsAt) {
  if (planCode !== 'monthly') {
    return null;
  }

  const value = new Date(startsAt);
  value.setMonth(value.getMonth() + 1);
  return value.toISOString();
}

function normalizeAccessTier(row) {
  const accessTier = row?.access_tier || row?.metadata?.access_tier || row?.metadata?.accessTier || null;
  return ACCESS_TIERS.includes(accessTier) ? accessTier : row?.course_id ? 'course' : 'free';
}

function getScopedCourseId(row) {
  return row?.course_id || row?.metadata?.course_id || row?.metadata?.courseId || null;
}

function isContentAccessible(row, snapshot) {
  const accessTier = normalizeAccessTier(row);

  if (accessTier === 'free') {
    return true;
  }

  if (accessTier === 'full') {
    return Boolean(snapshot?.access?.canAccessFullLibrary || snapshot?.access?.hasAdminPlatform);
  }

  const courseId = getScopedCourseId(row);
  return canAccessCourse(snapshot, courseId);
}

function sanitizeProtectedMedia(row, snapshot) {
  if (isContentAccessible(row, snapshot)) {
    return row;
  }

  return {
    ...row,
    media_url: null,
    thumbnail_url: row.thumbnail_url || null,
    url: null,
  };
}

async function syncLegacyMonthlyProjection(executor, userId) {
  const monthlyResult = await executor.query(
    `
      SELECT *
      FROM user_subscriptions
      WHERE user_id = $1
        AND plan_code = 'monthly'
        AND status = 'active'
        AND starts_at <= NOW()
        AND (ends_at IS NULL OR ends_at > NOW())
      ORDER BY starts_at DESC, created_at DESC
      LIMIT 1
    `,
    [userId]
  );

  const activeMonthly = monthlyResult.rows[0] || null;

  if (!activeMonthly) {
    await executor.query(
      `
        UPDATE monthly_subscriptions
        SET
          status = 'expired',
          expires_at = COALESCE(expires_at, NOW()),
          updated_at = NOW()
        WHERE user_id = $1
          AND status = 'active'
      `,
      [userId]
    );
    return null;
  }

  await executor.query(
    `
      INSERT INTO monthly_subscriptions (
        user_id,
        paypal_subscription_id,
        status,
        started_at,
        expires_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'active', $3, $4, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        paypal_subscription_id = EXCLUDED.paypal_subscription_id,
        status = EXCLUDED.status,
        started_at = EXCLUDED.started_at,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `,
    [
      userId,
      activeMonthly.provider_reference || activeMonthly.metadata?.provider_reference || null,
      activeMonthly.starts_at,
      activeMonthly.ends_at,
    ]
  );

  return activeMonthly;
}

async function syncLegacyCourseProjection(executor, userId) {
  const scopedResult = await executor.query(
    `
      SELECT DISTINCT metadata->>'course_id' AS course_id
      FROM user_subscriptions
      WHERE user_id = $1
        AND plan_code = 'student'
        AND status = 'active'
        AND starts_at <= NOW()
        AND (ends_at IS NULL OR ends_at > NOW())
        AND metadata ? 'course_id'
    `,
    [userId]
  );

  const courseIds = toSortedUnique(scopedResult.rows.map((row) => row.course_id).filter(Boolean));

  if (courseIds.length === 0) {
    await executor.query('DELETE FROM course_subscriptions WHERE user_id = $1', [userId]);
    return [];
  }

  await executor.query(
    `
      DELETE FROM course_subscriptions
      WHERE user_id = $1
        AND NOT (course_id = ANY($2::uuid[]))
    `,
    [userId, courseIds]
  );

  for (const courseId of courseIds) {
    await executor.query(
      `
        INSERT INTO course_subscriptions (user_id, course_id, subscribed_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, course_id) DO NOTHING
      `,
      [userId, courseId]
    );
  }

  return courseIds;
}

class SubscriptionService {
  static async listPlans({ executor = db } = {}) {
    await ensureCatalogReady(executor);
    return loadPlanCatalog(executor);
  }

  static async getUserSnapshot(userOrId, { executor = db } = {}) {
    const normalizedUser = normalizeUser(userOrId);
    if (!normalizedUser?.id) {
      return {
        user_id: null,
        roles: ['guest'],
        primary_plan_code: 'free',
        status: 'active',
        primary_source: 'manual',
        entitlements: [],
        access: buildAccessDecisions({
          roles: ['guest'],
          entitlements: [],
          scopedCourseIds: [],
        }),
        scoped_course_ids: [],
        subscriptions: [],
        overrides: [],
        plans: PLAN_SEEDS.map((plan) => ({
          ...plan,
          entitlements: [...plan.entitlements],
        })),
      };
    }

    await ensureCatalogReady(executor);

    const roles =
      normalizedUser.roles && normalizedUser.roles.length > 0
        ? normalizeRoles(normalizedUser.roles, { fallback: 'member' })
        : await loadRolesForUser(normalizedUser.id, executor);

    const [plans, subscriptions, overrides] = await Promise.all([
      loadPlanCatalog(executor),
      loadActiveSubscriptions(normalizedUser.id, executor),
      loadActiveOverrides(normalizedUser.id, executor),
    ]);

    return buildSnapshot({
      userId: normalizedUser.id,
      roles,
      plans,
      subscriptions,
      overrides,
    });
  }

  static async getUserContract(userOrId, { executor = db } = {}) {
    const snapshot = await this.getUserSnapshot(userOrId, { executor });
    return buildSubscriptionContract(snapshot);
  }

  static async listAdminSubscriptions({
    search = '',
    planCode = null,
    status = null,
    limit = 50,
    offset = 0,
    executor = db,
  } = {}) {
    await ensureCatalogReady(executor);

    const params = [];
    const conditions = ['1 = 1'];

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(
        `(LOWER(u.email) LIKE $${params.length} OR LOWER(COALESCE(p.full_name, '')) LIKE $${params.length})`
      );
    }

    if (planCode) {
      params.push(planCode);
      conditions.push(`us.plan_code = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`us.status = $${params.length}`);
    }

    params.push(Math.min(Math.max(limit, 1), 100));
    params.push(Math.max(offset, 0));

    const result = await executor.query(
      `
        SELECT
          us.*,
          u.email,
          p.full_name,
          p.avatar_url
        FROM user_subscriptions us
        INNER JOIN users u ON u.id = us.user_id
        LEFT JOIN profiles p ON p.id = us.user_id
        WHERE ${conditions.join('\n          AND ')}
        ORDER BY us.created_at DESC, us.starts_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    return result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      user: {
        id: row.user_id,
        email: row.email,
        full_name: row.full_name || row.email,
        avatar_url: row.avatar_url || null,
      },
      plan_code: row.plan_code,
      status: row.status,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      source: row.source,
      provider: row.provider || null,
      provider_reference: row.provider_reference || null,
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  static async grantSubscription({
    actorId = null,
    userId,
    planCode,
    status = 'active',
    startsAt = null,
    endsAt = null,
    source = 'manual',
    provider = null,
    providerReference = null,
    metadata = {},
    executor = db,
  }) {
    const normalizedMetadata = {
      ...(metadata || {}),
    };

    if (!normalizedMetadata.course_id && normalizedMetadata.courseId) {
      normalizedMetadata.course_id = normalizedMetadata.courseId;
    }

    if (!userId) {
      throw httpError(400, 'user_id is required', 'SUBSCRIPTION_USER_REQUIRED');
    }

    if (!PLAN_CODES.includes(planCode)) {
      throw httpError(400, 'Invalid plan_code supplied', 'SUBSCRIPTION_PLAN_INVALID');
    }

    if (status !== 'active') {
      throw httpError(400, 'Only active grants are supported for new subscriptions', 'SUBSCRIPTION_STATUS_INVALID');
    }

    if (planCode === 'student' && !normalizedMetadata.course_id) {
      throw httpError(400, 'student grants require metadata.course_id', 'SUBSCRIPTION_COURSE_REQUIRED');
    }

    const client = executor.connect ? await executor.connect() : null;
    const queryExecutor = client || executor;
    const effectiveStartsAt = startsAt || new Date().toISOString();
    const effectiveEndsAt = endsAt || getDefaultEndsAt(planCode, effectiveStartsAt);

    try {
      if (client) {
        await client.query('BEGIN');
      }

      await ensureCatalogReady(queryExecutor);

      const userResult = await queryExecutor.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
      if (!userResult.rows[0]) {
        throw httpError(404, 'User not found', 'USER_NOT_FOUND');
      }

      if (planCode === 'monthly') {
        await queryExecutor.query(
          `
            UPDATE user_subscriptions
            SET
              status = 'canceled',
              ends_at = NOW(),
              updated_at = NOW()
            WHERE user_id = $1
              AND plan_code = 'monthly'
              AND status = 'active'
          `,
          [userId]
        );
      }

      if (planCode === 'student' && normalizedMetadata.course_id) {
        await queryExecutor.query(
          `
            UPDATE user_subscriptions
            SET
              status = 'canceled',
              ends_at = NOW(),
              updated_at = NOW()
            WHERE user_id = $1
              AND plan_code = 'student'
              AND status = 'active'
              AND metadata->>'course_id' = $2
          `,
          [userId, normalizedMetadata.course_id]
        );
      }

      const result = await queryExecutor.query(
        `
          INSERT INTO user_subscriptions (
            user_id,
            plan_code,
            status,
            starts_at,
            ends_at,
            source,
            provider,
            provider_reference,
            metadata,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
          RETURNING *
        `,
        [
          userId,
          planCode,
          status,
          effectiveStartsAt,
          effectiveEndsAt,
          source,
          provider,
          providerReference,
          JSON.stringify(normalizedMetadata),
          actorId,
        ]
      );

      await syncLegacyMonthlyProjection(queryExecutor, userId);
      await syncLegacyCourseProjection(queryExecutor, userId);

      if (client) {
        await client.query('COMMIT');
      }

      return {
        ...result.rows[0],
        metadata: result.rows[0].metadata || {},
      };
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client?.release();
    }
  }

  static async revokeSubscription({
    actorId = null,
    subscriptionId = null,
    userId = null,
    planCode = null,
    courseId = null,
    reason = null,
    executor = db,
  }) {
    const client = executor.connect ? await executor.connect() : null;
    const queryExecutor = client || executor;

    try {
      if (client) {
        await client.query('BEGIN');
      }

      let target = null;

      if (subscriptionId) {
        const result = await queryExecutor.query(
          'SELECT * FROM user_subscriptions WHERE id = $1 LIMIT 1',
          [subscriptionId]
        );
        target = result.rows[0] || null;
      } else if (userId && planCode) {
        const params = [userId, planCode];
        let sql = `
          SELECT *
          FROM user_subscriptions
          WHERE user_id = $1
            AND plan_code = $2
            AND status = 'active'
        `;

        if (planCode === 'student' && courseId) {
          params.push(courseId);
          sql += `
            AND (
              metadata->>'course_id' = $3
              OR metadata->>'courseId' = $3
            )
          `;
        }

        sql += `
          ORDER BY starts_at DESC, created_at DESC
          LIMIT 1
        `;

        const result = await queryExecutor.query(sql, params);
        target = result.rows[0] || null;
      }

      if (!target) {
        throw httpError(404, 'Subscription not found', 'SUBSCRIPTION_NOT_FOUND');
      }

      const result = await queryExecutor.query(
        `
          UPDATE user_subscriptions
          SET
            status = 'canceled',
            ends_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          target.id,
          JSON.stringify({
            revoked_by: actorId,
            revoke_reason: reason || null,
          }),
        ]
      );

      await syncLegacyMonthlyProjection(queryExecutor, target.user_id);
      await syncLegacyCourseProjection(queryExecutor, target.user_id);

      if (client) {
        await client.query('COMMIT');
      }

      return {
        ...result.rows[0],
        metadata: result.rows[0].metadata || {},
      };
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client?.release();
    }
  }

  static async listAccessibleCourseIds(userOrId, { executor = db } = {}) {
    const snapshot = await this.getUserSnapshot(userOrId, { executor });

    if (snapshot.access.canAccessFullLibrary || snapshot.access.hasAdminPlatform) {
      const result = await executor.query(
        `
          SELECT id
          FROM trainer_courses
          WHERE COALESCE(is_approved, false) = TRUE
          ORDER BY created_at DESC
        `
      );

      return result.rows.map((row) => row.id);
    }

    return snapshot.scoped_course_ids;
  }

  static async buildLegacyMonthlySubscription(userOrId, { executor = db } = {}) {
    const snapshot = await this.getUserSnapshot(userOrId, { executor });
    const monthlySubscription =
      snapshot.subscriptions.find((subscription) => subscription.plan_code === 'monthly') || null;

    if (!monthlySubscription) {
      return null;
    }

    return {
      id: monthlySubscription.id,
      user_id: snapshot.user_id,
      paypal_subscription_id:
        monthlySubscription.provider_reference || monthlySubscription.metadata?.provider_reference || null,
      status: monthlySubscription.status,
      started_at: monthlySubscription.starts_at,
      expires_at: monthlySubscription.ends_at,
      provider: monthlySubscription.provider || null,
      source: monthlySubscription.source,
    };
  }

  static async buildLegacyCourseSubscriptions(userOrId, { executor = db } = {}) {
    const snapshot = await this.getUserSnapshot(userOrId, { executor });
    const accessibleCourseIds = await this.listAccessibleCourseIds(userOrId, { executor });

    return accessibleCourseIds.map((courseId) => ({
      id: `${snapshot.user_id}:${courseId}`,
      user_id: snapshot.user_id,
      course_id: courseId,
      subscribed_at: null,
    }));
  }

  static canAccessCourse(snapshot, courseId) {
    return canAccessCourse(snapshot, courseId);
  }

  static isContentAccessible(row, snapshot) {
    return isContentAccessible(row, snapshot);
  }

  static sanitizeProtectedMedia(row, snapshot) {
    return sanitizeProtectedMedia(row, snapshot);
  }

  static getScopedCourseId(row) {
    return getScopedCourseId(row);
  }

  static normalizeAccessTier(row) {
    return normalizeAccessTier(row);
  }

  static getFuturePaymentProviders() {
    return FUTURE_PAYMENT_PROVIDERS;
  }
}

module.exports = SubscriptionService;
