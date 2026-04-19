const OFFICIAL_APP_ROLES = ['guest', 'member', 'trainer', 'moderator', 'admin'];
const ASSIGNABLE_APP_ROLES = ['member', 'trainer', 'moderator', 'admin'];
const ROLE_PRIORITY = ['admin', 'moderator', 'trainer', 'member', 'guest'];

const ROLE_ALIASES = {
  student: 'member',
  member: 'member',
  guest: 'guest',
  trainer: 'trainer',
  moderator: 'moderator',
  admin: 'admin',
};

function normalizeRole(role, { fallback = 'guest' } = {}) {
  if (!role) {
    return fallback;
  }

  const normalized = ROLE_ALIASES[String(role).trim().toLowerCase()];
  return normalized || fallback;
}

function normalizeRoles(roles = [], { fallback = 'guest' } = {}) {
  const source = Array.isArray(roles) ? roles : [roles];
  const normalized = source
    .map((role) => normalizeRole(role, { fallback: '' }))
    .filter(Boolean);

  if (normalized.length === 0) {
    return fallback ? [fallback] : [];
  }

  return [...new Set(normalized)];
}

function getPrimaryRole(roles = [], { fallback = 'guest' } = {}) {
  const normalized = normalizeRoles(roles, { fallback });

  for (const role of ROLE_PRIORITY) {
    if (normalized.includes(role)) {
      return role;
    }
  }

  return fallback;
}

function toStorageRole(role) {
  const normalized = normalizeRole(role, { fallback: 'member' });

  if (normalized === 'guest') {
    return null;
  }

  if (normalized === 'member') {
    return 'student';
  }

  return normalized;
}

module.exports = {
  ASSIGNABLE_APP_ROLES,
  OFFICIAL_APP_ROLES,
  getPrimaryRole,
  normalizeRole,
  normalizeRoles,
  toStorageRole,
};
