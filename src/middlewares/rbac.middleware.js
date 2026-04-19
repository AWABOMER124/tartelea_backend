const { error } = require('../utils/response');
const {
  getPrimaryRole,
  normalizeRole,
  normalizeRoles,
} = require('../utils/roles');

const ADMIN_ROLES = ['admin', 'moderator'];

function attachNormalizedRoles(req, _res, next) {
  if (req.user) {
    req.user.roles = normalizeRoles(req.user.roles, { fallback: 'member' });
    req.user.role = getPrimaryRole(req.user.roles, { fallback: 'member' });
  }

  next();
}

function requireRoles(...allowedRoles) {
  const normalizedAllowedRoles = normalizeRoles(allowedRoles, { fallback: '' });

  return (req, res, next) => {
    const normalizedUserRoles = normalizeRoles(req.user?.roles, { fallback: 'member' });
    const hasAccess = normalizedUserRoles.some((role) => normalizedAllowedRoles.includes(role));

    if (!hasAccess) {
      return error(
        res,
        `Access denied. Requires one of: ${normalizedAllowedRoles.join(', ')}`,
        403,
        'FORBIDDEN'
      );
    }

    req.user.roles = normalizedUserRoles;
    req.user.role = getPrimaryRole(normalizedUserRoles, { fallback: 'member' });
    next();
  };
}

const requireAdminAccess = requireRoles(...ADMIN_ROLES);
const requireAdmin = requireRoles('admin');
const requireModerator = requireRoles('moderator');

module.exports = {
  ADMIN_ROLES,
  attachNormalizedRoles,
  getPrimaryRole,
  normalizeRole,
  normalizeRoles,
  requireAdminAccess,
  requireAdmin,
  requireModerator,
  requireRoles,
};
