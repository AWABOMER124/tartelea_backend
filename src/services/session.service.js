const db = require('../db');
const env = require('../config/env');
const { httpError } = require('../utils/httpError');
const livekitService = require('./livekit.service');
const SubscriptionService = require('./subscription.service');
const { normalizeRoles, getPrimaryRole } = require('../middlewares/rbac.middleware');

const SPEAKING_ROOM_ROLES = new Set(['host', 'co_host', 'moderator', 'speaker']);
const MODERATION_ROOM_ROLES = new Set(['host', 'co_host', 'moderator']);
const KICK_ROOM_ROLES = new Set(['host', 'co_host']);
const PRIVILEGED_SYSTEM_ROLES = new Set(['admin', 'moderator']);

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  const roles = normalizeRoles(user.roles || (user.role ? [user.role] : []), {
    fallback: 'member',
  });

  return {
    ...user,
    roles,
    role: getPrimaryRole(roles, { fallback: 'member' }),
  };
}

function deriveSessionStatus(row) {
  if (row.ended_at) {
    return 'ended';
  }

  if (row.is_live) {
    return 'live';
  }

  return 'scheduled';
}

function deriveVisibility(row) {
  if (row.access_type === 'subscribers_only') {
    return 'restricted';
  }

  return 'public';
}

function getLivekitRoomName(row) {
  return row.livekit_room_name || row.id;
}

function isPrivilegedSystemUser(user) {
  return Boolean(user?.roles?.some((role) => PRIVILEGED_SYSTEM_ROLES.has(role)));
}

function resolveRoomRole(row, user) {
  if (!user) {
    return 'guest';
  }

  if (row.host_id === user.id) {
    return 'host';
  }

  if (row.viewer_room_role) {
    return row.viewer_room_role;
  }

  if (isPrivilegedSystemUser(user)) {
    return 'moderator';
  }

  return 'listener';
}

function evaluateAccess(row, user, subscriptionSnapshot = null) {
  const status = deriveSessionStatus(row);
  const visibility = deriveVisibility(row);
  const roomRole = resolveRoomRole(row, user);
  const allowListeners = row.allow_listeners !== false;
  const maxParticipants = Number(row.max_participants) || 50;
  const participantCount = Number(row.participant_count) || 0;
  const isParticipant = Boolean(row.viewer_is_participant) || row.host_id === user?.id;
  const isPrivileged = isPrivilegedSystemUser(user) || roomRole === 'host';
  const subscriptionAccess = subscriptionSnapshot?.access || null;

  let canJoin = false;
  let denialReason = null;

  if (!user) {
    denialReason = 'AUTH_REQUIRED';
  } else if (!row.is_approved && !isPrivileged) {
    denialReason = 'SESSION_NOT_APPROVED';
  } else if (status === 'ended') {
    denialReason = 'SESSION_ENDED';
  } else if (participantCount >= maxParticipants && !isParticipant && !isPrivileged) {
    denialReason = 'SESSION_FULL';
  } else if (visibility === 'restricted' && !env.SUBSCRIPTIONS_PAUSED && !isPrivileged && !subscriptionAccess?.canJoinPremiumRoom) {
    denialReason = 'SUBSCRIPTION_REQUIRED';
  } else if (visibility === 'public' && !isPrivileged && !subscriptionAccess?.canJoinRoom) {
    denialReason = 'ROOM_ACCESS_REQUIRED';
  } else {
    canJoin = true;
  }

  const canListen = canJoin && status === 'live' && allowListeners;
  const canSpeak = canListen && SPEAKING_ROOM_ROLES.has(roomRole);
  const canModerate = canJoin && MODERATION_ROOM_ROLES.has(roomRole);

  return {
    room_role: roomRole,
    is_registered: isParticipant,
    canJoin,
    canListen,
    canSpeak,
    canModerate,
    canPublish: canSpeak,
    canPublishData: canSpeak,
    canSubscribe: canJoin && status === 'live',
    canStartSession: roomRole === 'host' && status === 'scheduled',
    canEndSession: roomRole === 'host' && status === 'live',
    canPromoteSpeaker: canModerate,
    canPromoteCoHost: roomRole === 'host',
    canPromoteModerator: roomRole === 'host',
    canKick: KICK_ROOM_ROLES.has(roomRole),
    denialReason,
  };
}

function mapRoomSummary(row, access, counts = {}) {
  return {
    room_id: getLivekitRoomName(row),
    session_id: row.id,
    room_type: row.room_type || 'stage',
    host_id: row.host_id,
    host: {
      id: row.host_id,
      name: row.host_name || 'Session Host',
      avatar_url: row.host_avatar || null,
    },
    speakers: counts.speakers || [],
    moderators: counts.moderators || [],
    allow_listeners: row.allow_listeners !== false,
    max_participants: Number(row.max_participants) || 50,
    participant_count: Number(row.participant_count) || 0,
    access,
  };
}

function mapSessionSummary(row, access, counts = {}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    program_id: row.program_id || null,
    track_id: row.track_id || null,
    start_time: row.scheduled_at || row.created_at,
    end_time: row.ended_at || null,
    actual_started_at: row.actual_started_at || null,
    scheduled_at: row.scheduled_at || row.created_at,
    status: deriveSessionStatus(row),
    visibility: deriveVisibility(row),
    category: row.category || 'community',
    image_url: row.image_url || null,
    price: Number(row.price) || 0,
    speaker_count: counts.speakers?.length || 0,
    moderator_count: counts.moderators?.length || 0,
    speakers: counts.speakers || [],
  };
}

function mapParticipant(row) {
  return {
    id: row.user_id,
    name: row.full_name || row.email || 'Member',
    avatar_url: row.avatar_url || null,
    bio: row.bio || null,
    room_role: row.room_role || (row.is_host ? 'host' : 'listener'),
    is_host: Boolean(row.is_host),
    is_present: Boolean(row.is_present),
    has_raised_hand: Boolean(row.has_raised_hand),
    joined_at: row.joined_at || null,
  };
}

function mapHandRaise(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.full_name || row.email || 'Member',
    avatar_url: row.avatar_url || null,
    created_at: row.created_at,
  };
}

async function getSessionRowById(executor, sessionId, viewerId = null) {
  const result = await executor.query(
    `
      SELECT
        r.*,
        NULL::uuid AS program_id,
        NULL::uuid AS track_id,
        'stage'::text AS room_type,
        TRUE AS allow_listeners,
        r.id::text AS livekit_room_name,
        COALESCE(hp.full_name, hu.email, 'Session Host') AS host_name,
        hp.avatar_url AS host_avatar,
        viewer_role.role AS viewer_room_role,
        (viewer_participant.id IS NOT NULL) AS viewer_is_participant,
        COALESCE(participant_counts.count, 0)::int AS participant_count
      FROM rooms r
      LEFT JOIN users hu ON hu.id = r.host_id
      LEFT JOIN profiles hp ON hp.id = r.host_id
      LEFT JOIN room_roles viewer_role
        ON viewer_role.room_id = r.id
       AND viewer_role.user_id = $2
      LEFT JOIN room_participants viewer_participant
        ON viewer_participant.room_id = r.id
       AND viewer_participant.user_id = $2
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS count
        FROM room_participants rp
        WHERE rp.room_id = r.id
      ) participant_counts ON TRUE
      WHERE r.id = $1
      LIMIT 1
    `,
    [sessionId, viewerId]
  );

  return result.rows[0] || null;
}

async function listSpeakerAndModeratorSummaries(executor, sessionId, hostId) {
  const result = await executor.query(
    `
      WITH room_people AS (
        SELECT
          r.host_id AS user_id,
          'host'::text AS room_role
        FROM rooms r
        WHERE r.id = $1

        UNION

        SELECT
          rp.user_id,
          rr.role::text AS room_role
        FROM room_participants rp
        INNER JOIN room_roles rr
          ON rr.room_id = rp.room_id
         AND rr.user_id = rp.user_id
        WHERE rp.room_id = $1
          AND rp.user_id <> $2
          AND rr.role IN ('co_host', 'moderator', 'speaker')
      )
      SELECT
        rp.user_id,
        rp.room_role,
        COALESCE(p.full_name, u.email, 'Member') AS full_name,
        p.avatar_url
      FROM room_people rp
      LEFT JOIN users u ON u.id = rp.user_id
      LEFT JOIN profiles p ON p.id = rp.user_id
      ORDER BY CASE rp.room_role
        WHEN 'host' THEN 0
        WHEN 'co_host' THEN 1
        WHEN 'moderator' THEN 2
        WHEN 'speaker' THEN 3
        ELSE 4
      END, full_name ASC
    `,
    [sessionId, hostId]
  );

  const speakers = result.rows
    .filter((row) => SPEAKING_ROOM_ROLES.has(row.room_role))
    .map((row) => ({
      id: row.user_id,
      name: row.full_name,
      avatar_url: row.avatar_url || null,
      room_role: row.room_role,
    }));

  const moderators = result.rows
    .filter((row) => MODERATION_ROOM_ROLES.has(row.room_role))
    .map((row) => ({
      id: row.user_id,
      name: row.full_name,
      avatar_url: row.avatar_url || null,
      room_role: row.room_role,
    }));

  return { speakers, moderators };
}

async function listSessionParticipants(executor, sessionId, hostId) {
  const result = await executor.query(
    `
      WITH room_people AS (
        SELECT
          r.host_id AS user_id,
          TRUE AS is_host,
          TRUE AS is_present,
          NULL::timestamptz AS joined_at
        FROM rooms r
        WHERE r.id = $1

        UNION

        SELECT
          rp.user_id,
          FALSE AS is_host,
          TRUE AS is_present,
          rp.joined_at
        FROM room_participants rp
        WHERE rp.room_id = $1
          AND rp.user_id <> $2
      )
      SELECT
        people.user_id,
        people.is_host,
        people.is_present,
        people.joined_at,
        COALESCE(rr.role::text, CASE WHEN people.is_host THEN 'host' ELSE 'listener' END) AS room_role,
        COALESCE(p.full_name, u.email, 'Member') AS full_name,
        p.avatar_url,
        p.bio,
        EXISTS (
          SELECT 1
          FROM room_hand_raises rh
          WHERE rh.room_id = $1
            AND rh.user_id = people.user_id
            AND rh.status = 'pending'
        ) AS has_raised_hand
      FROM room_people people
      LEFT JOIN room_roles rr
        ON rr.room_id = $1
       AND rr.user_id = people.user_id
      LEFT JOIN users u ON u.id = people.user_id
      LEFT JOIN profiles p ON p.id = people.user_id
      ORDER BY CASE
        WHEN people.is_host THEN 0
        WHEN rr.role = 'co_host' THEN 1
        WHEN rr.role = 'moderator' THEN 2
        WHEN rr.role = 'speaker' THEN 3
        ELSE 4
      END, full_name ASC
    `,
    [sessionId, hostId]
  );

  return result.rows.map((row) => mapParticipant(row));
}

async function listPendingHandRaises(executor, sessionId) {
  const result = await executor.query(
    `
      SELECT
        rh.id,
        rh.user_id,
        rh.created_at,
        COALESCE(p.full_name, u.email, 'Member') AS full_name,
        p.avatar_url
      FROM room_hand_raises rh
      LEFT JOIN users u ON u.id = rh.user_id
      LEFT JOIN profiles p ON p.id = rh.user_id
      WHERE rh.room_id = $1
        AND rh.status = 'pending'
      ORDER BY rh.created_at ASC
    `,
    [sessionId]
  );

  return result.rows.map((row) => mapHandRaise(row));
}

class SessionService {
  static async listSessions({ reqUser, status, limit = 50, offset = 0 }) {
    const user = normalizeUser(reqUser);
    const subscriptionSnapshot = user ? await SubscriptionService.getUserSnapshot(user) : null;
    const viewerId = user?.id || null;
    const params = [viewerId];
    const where = ['1 = 1'];

    if (status === 'live') {
      where.push('r.is_live = TRUE');
      where.push('r.ended_at IS NULL');
    } else if (status === 'scheduled') {
      where.push('COALESCE(r.is_live, FALSE) = FALSE');
      where.push('r.ended_at IS NULL');
    } else if (status === 'ended') {
      where.push('r.ended_at IS NOT NULL');
    }

    const isPrivileged = Boolean(user && isPrivilegedSystemUser(user));

    if (!isPrivileged) {
      where.push('(r.is_approved = TRUE OR r.host_id = $1)');
    }

    // The COUNT query only needs the `$1` param when the approval/host clause is present.
    // For privileged users we avoid passing extra bind parameters (prevents pg "bind message supplies ...").
    const countParams = isPrivileged ? [] : params;

    const countResult = await db.query(
      `
        SELECT COUNT(*)::int AS total
        FROM rooms r
        WHERE ${where.join('\n          AND ')}
      `,
      countParams
    );

    const queryParams = [...params];
    queryParams.push(Math.min(Math.max(limit, 1), 100));
    queryParams.push(Math.max(offset, 0));

    const result = await db.query(
      `
        SELECT
          r.*,
          NULL::uuid AS program_id,
          NULL::uuid AS track_id,
          'stage'::text AS room_type,
          TRUE AS allow_listeners,
          r.id::text AS livekit_room_name,
          COALESCE(hp.full_name, hu.email, 'Session Host') AS host_name,
          hp.avatar_url AS host_avatar,
          viewer_role.role AS viewer_room_role,
          (viewer_participant.id IS NOT NULL) AS viewer_is_participant,
          COALESCE(participant_counts.count, 0)::int AS participant_count
        FROM rooms r
        LEFT JOIN users hu ON hu.id = r.host_id
        LEFT JOIN profiles hp ON hp.id = r.host_id
        LEFT JOIN room_roles viewer_role
          ON viewer_role.room_id = r.id
         AND viewer_role.user_id = $1
        LEFT JOIN room_participants viewer_participant
          ON viewer_participant.room_id = r.id
         AND viewer_participant.user_id = $1
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS count
          FROM room_participants rp
          WHERE rp.room_id = r.id
        ) participant_counts ON TRUE
        WHERE ${where.join('\n          AND ')}
        ORDER BY
          CASE
            WHEN r.is_live THEN 0
            WHEN r.ended_at IS NULL THEN 1
            ELSE 2
          END,
          COALESCE(r.scheduled_at, r.created_at) ASC
        LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
      `,
      queryParams
    );

    const items = await Promise.all(
      result.rows.map(async (row) => {
        const access = evaluateAccess(row, user, subscriptionSnapshot);
        const counts = await listSpeakerAndModeratorSummaries(db, row.id, row.host_id);

        return {
          session: mapSessionSummary(row, access, counts),
          room: mapRoomSummary(row, access, counts),
          access,
        };
      })
    );

    return {
      items,
      total: countResult.rows[0]?.total || 0,
      limit: Math.min(Math.max(limit, 1), 100),
      offset: Math.max(offset, 0),
    };
  }

  static async getSessionDetails({ reqUser, sessionId }) {
    const user = normalizeUser(reqUser);
    const subscriptionSnapshot = user ? await SubscriptionService.getUserSnapshot(user) : null;
    const row = await getSessionRowById(db, sessionId, user?.id || null);

    if (!row) {
      throw httpError(404, 'Session not found', 'SESSION_NOT_FOUND');
    }

    if (!row.is_approved && row.host_id !== user?.id && !isPrivilegedSystemUser(user)) {
      throw httpError(404, 'Session not found', 'SESSION_NOT_FOUND');
    }

    const access = evaluateAccess(row, user, subscriptionSnapshot);
    const [counts, participants, handRaises] = await Promise.all([
      listSpeakerAndModeratorSummaries(db, row.id, row.host_id),
      listSessionParticipants(db, row.id, row.host_id),
      listPendingHandRaises(db, row.id),
    ]);

    return {
      session: mapSessionSummary(row, access, counts),
      room: mapRoomSummary(row, access, counts),
      access,
      participants,
      hand_raises: access.canModerate ? handRaises : [],
    };
  }

  static async createSession({ reqUser, payload }) {
    const user = normalizeUser(reqUser);
    if (!user) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const subscriptionSnapshot = await SubscriptionService.getUserSnapshot(user);
    if (!subscriptionSnapshot.access.canCreateRoom && !subscriptionSnapshot.access.canHostSessions) {
      throw httpError(403, 'Your current entitlements do not allow room creation', 'ROOM_CREATION_NOT_ALLOWED');
    }

    const scheduledAt = payload.scheduled_at ? new Date(payload.scheduled_at).toISOString() : new Date().toISOString();

    const result = await db.query(
      `
        INSERT INTO rooms (
          title,
          description,
          host_id,
          category,
          scheduled_at,
          duration_minutes,
          is_live,
          is_approved,
          price,
          max_participants,
          access_type,
          image_url,
          actual_started_at,
          ended_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, FALSE, FALSE, $7, $8, $9, $10, NULL, NULL, NOW())
        RETURNING *
      `,
      [
        payload.title.trim(),
        payload.description?.trim() || null,
        user.id,
        payload.category || 'community',
        scheduledAt,
        payload.duration_minutes || 30,
        payload.price || 0,
        payload.max_participants || 50,
        payload.access_type || 'public',
        payload.image_url || null,
      ]
    );

    const row = await getSessionRowById(db, result.rows[0].id, user.id);
    const access = evaluateAccess(row, user, subscriptionSnapshot);
    const counts = await listSpeakerAndModeratorSummaries(db, row.id, row.host_id);

    return {
      session: mapSessionSummary(row, access, counts),
      room: mapRoomSummary(row, access, counts),
      access,
    };
  }

  static async joinSession({ reqUser, sessionId }) {
    const user = normalizeUser(reqUser);
    if (!user) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const subscriptionSnapshot = await SubscriptionService.getUserSnapshot(user);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const row = await getSessionRowById(client, sessionId, user.id);
      if (!row) {
        throw httpError(404, 'Session not found', 'SESSION_NOT_FOUND');
      }

      const access = evaluateAccess(row, user, subscriptionSnapshot);
      if (!access.canJoin) {
        throw httpError(403, access.denialReason || 'Access denied', 'SESSION_ACCESS_DENIED');
      }

      await client.query(
        `
          INSERT INTO room_participants (room_id, user_id, joined_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (room_id, user_id)
          DO UPDATE SET joined_at = room_participants.joined_at
        `,
        [sessionId, user.id]
      );

      const refreshedRow = await getSessionRowById(client, sessionId, user.id);
      const refreshedAccess = evaluateAccess(refreshedRow, user, subscriptionSnapshot);
      const counts = await listSpeakerAndModeratorSummaries(client, refreshedRow.id, refreshedRow.host_id);

      let token = null;
      if (refreshedAccess.canSubscribe) {
        token = await livekitService.generateToken({
          roomName: getLivekitRoomName(refreshedRow),
          identity: user.id,
          canPublish: refreshedAccess.canPublish,
          canSubscribe: refreshedAccess.canSubscribe,
          canPublishData: refreshedAccess.canPublishData,
          metadata: {
            sessionId: refreshedRow.id,
            roomRole: refreshedAccess.room_role,
            systemRole: user.role,
          },
        });
      }

      await client.query('COMMIT');

      return {
        token,
        session: mapSessionSummary(refreshedRow, refreshedAccess, counts),
        room: mapRoomSummary(refreshedRow, refreshedAccess, counts),
        access: refreshedAccess,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async leaveSession({ reqUser, sessionId }) {
    const user = normalizeUser(reqUser);
    if (!user) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const row = await getSessionRowById(db, sessionId, user.id);
    if (!row) {
      throw httpError(404, 'Session not found', 'SESSION_NOT_FOUND');
    }

    if (row.host_id !== user.id) {
      await db.query(
        `
          DELETE FROM room_participants
          WHERE room_id = $1
            AND user_id = $2
        `,
        [sessionId, user.id]
      );
    }

    const refreshedRow = await getSessionRowById(db, sessionId, user.id);
    const access = evaluateAccess(
      refreshedRow,
      user,
      user ? await SubscriptionService.getUserSnapshot(user) : null
    );
    const counts = await listSpeakerAndModeratorSummaries(db, refreshedRow.id, refreshedRow.host_id);

    return {
      session: mapSessionSummary(refreshedRow, access, counts),
      room: mapRoomSummary(refreshedRow, access, counts),
      access,
    };
  }

  static async manageSessionAction({ reqUser, sessionId, action, targetUserId }) {
    const user = normalizeUser(reqUser);
    if (!user) {
      throw httpError(401, 'Authentication required', 'UNAUTHORIZED');
    }

    const subscriptionSnapshot = await SubscriptionService.getUserSnapshot(user);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const row = await getSessionRowById(client, sessionId, user.id);
      if (!row) {
        throw httpError(404, 'Session not found', 'SESSION_NOT_FOUND');
      }

      const access = evaluateAccess(row, user, subscriptionSnapshot);

      const requireTarget = () => {
        if (!targetUserId) {
          throw httpError(400, 'target_user_id is required', 'SESSION_TARGET_REQUIRED');
        }
      };

      switch (action) {
        case 'raise_hand':
          if (!access.canJoin || !access.is_registered) {
            throw httpError(403, 'You must join the session before raising your hand', 'SESSION_ACCESS_DENIED');
          }
          if (access.canSpeak) {
            throw httpError(400, 'Speakers do not need to raise their hand', 'SESSION_ACTION_INVALID');
          }
          await client.query(
            `
              INSERT INTO room_hand_raises (room_id, user_id, status, created_at, resolved_at, resolved_by)
              VALUES ($1, $2, 'pending', NOW(), NULL, NULL)
              ON CONFLICT (room_id, user_id)
              DO UPDATE SET
                status = 'pending',
                created_at = NOW(),
                resolved_at = NULL,
                resolved_by = NULL
            `,
            [sessionId, user.id]
          );
          break;

        case 'lower_hand':
          if (!access.canJoin) {
            throw httpError(403, 'You cannot update your hand raise in this session', 'SESSION_ACCESS_DENIED');
          }
          await client.query(
            `
              DELETE FROM room_hand_raises
              WHERE room_id = $1
                AND user_id = $2
            `,
            [sessionId, user.id]
          );
          break;

        case 'start_live':
          if (!access.canStartSession) {
            throw httpError(403, 'Only the host can start the session', 'SESSION_ACCESS_DENIED');
          }
          await client.query(
            `
              UPDATE rooms
              SET is_live = TRUE,
                  actual_started_at = NOW(),
                  ended_at = NULL,
                  updated_at = NOW()
              WHERE id = $1
            `,
            [sessionId]
          );
          break;

        case 'end_session':
          if (!access.canEndSession) {
            throw httpError(403, 'Only the host can end the session', 'SESSION_ACCESS_DENIED');
          }
          await client.query(
            `
              UPDATE rooms
              SET is_live = FALSE,
                  ended_at = NOW(),
                  updated_at = NOW()
              WHERE id = $1
            `,
            [sessionId]
          );
          break;

        case 'promote_speaker':
          requireTarget();
          if (!access.canPromoteSpeaker) {
            throw httpError(403, 'You cannot promote speakers in this session', 'SESSION_ACCESS_DENIED');
          }
          await client.query(
            `
              INSERT INTO room_roles (room_id, user_id, role, assigned_by)
              VALUES ($1, $2, 'speaker', $3)
              ON CONFLICT (room_id, user_id)
              DO UPDATE SET role = 'speaker', assigned_by = $3
            `,
            [sessionId, targetUserId, user.id]
          );
          break;

        case 'demote_listener':
          requireTarget();
          if (!access.canPromoteSpeaker) {
            throw httpError(403, 'You cannot demote speakers in this session', 'SESSION_ACCESS_DENIED');
          }
          if (targetUserId === row.host_id) {
            throw httpError(400, 'Cannot demote the host', 'SESSION_ACTION_INVALID');
          }
          await client.query(
            `
              DELETE FROM room_roles
              WHERE room_id = $1
                AND user_id = $2
            `,
            [sessionId, targetUserId]
          );
          break;

        case 'promote_co_host':
          requireTarget();
          if (!access.canPromoteCoHost) {
            throw httpError(403, 'Only the host can promote co-hosts', 'SESSION_ACCESS_DENIED');
          }
          await client.query(
            `
              INSERT INTO room_roles (room_id, user_id, role, assigned_by)
              VALUES ($1, $2, 'co_host', $3)
              ON CONFLICT (room_id, user_id)
              DO UPDATE SET role = 'co_host', assigned_by = $3
            `,
            [sessionId, targetUserId, user.id]
          );
          break;

        case 'promote_moderator':
          requireTarget();
          if (!access.canPromoteModerator) {
            throw httpError(403, 'Only the host can assign moderators', 'SESSION_ACCESS_DENIED');
          }
          await client.query(
            `
              INSERT INTO room_roles (room_id, user_id, role, assigned_by)
              VALUES ($1, $2, 'moderator', $3)
              ON CONFLICT (room_id, user_id)
              DO UPDATE SET role = 'moderator', assigned_by = $3
            `,
            [sessionId, targetUserId, user.id]
          );
          break;

        case 'kick':
          requireTarget();
          if (!access.canKick) {
            throw httpError(403, 'You cannot kick users from this session', 'SESSION_ACCESS_DENIED');
          }
          if (targetUserId === row.host_id) {
            throw httpError(400, 'Cannot kick the host', 'SESSION_ACTION_INVALID');
          }
          await client.query(
            `
              DELETE FROM room_roles
              WHERE room_id = $1
                AND user_id = $2
            `,
            [sessionId, targetUserId]
          );
          await client.query(
            `
              DELETE FROM room_participants
              WHERE room_id = $1
                AND user_id = $2
            `,
            [sessionId, targetUserId]
          );
          await client.query(
            `
              DELETE FROM room_hand_raises
              WHERE room_id = $1
                AND user_id = $2
                AND status = 'pending'
            `,
            [sessionId, targetUserId]
          );
          break;

        case 'accept_hand':
          requireTarget();
          if (!access.canPromoteSpeaker) {
            throw httpError(403, 'You cannot resolve hand raises in this session', 'SESSION_ACCESS_DENIED');
          }
          await client.query(
            `
              UPDATE room_hand_raises
              SET status = 'accepted',
                  resolved_by = $3,
                  resolved_at = NOW()
              WHERE room_id = $1
                AND user_id = $2
                AND status = 'pending'
            `,
            [sessionId, targetUserId, user.id]
          );
          await client.query(
            `
              INSERT INTO room_roles (room_id, user_id, role, assigned_by)
              VALUES ($1, $2, 'speaker', $3)
              ON CONFLICT (room_id, user_id)
              DO UPDATE SET role = 'speaker', assigned_by = $3
            `,
            [sessionId, targetUserId, user.id]
          );
          break;

        case 'reject_hand':
          requireTarget();
          if (!access.canPromoteSpeaker) {
            throw httpError(403, 'You cannot resolve hand raises in this session', 'SESSION_ACCESS_DENIED');
          }
          await client.query(
            `
              UPDATE room_hand_raises
              SET status = 'rejected',
                  resolved_by = $3,
                  resolved_at = NOW()
              WHERE room_id = $1
                AND user_id = $2
                AND status = 'pending'
            `,
            [sessionId, targetUserId, user.id]
          );
          break;

        default:
          throw httpError(400, 'Unsupported session action', 'SESSION_ACTION_INVALID');
      }

      await client.query('COMMIT');
      return this.getSessionDetails({ reqUser: user, sessionId });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = SessionService;
