const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { error } = require('../utils/response');
const { getPrimaryRole, normalizeRoles } = require('./rbac.middleware');

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.warn(`[AUTH] 401 Unauthorized - No token provided for ${req.method} ${req.originalUrl}`);
    return error(res, 'Access denied. No token provided.', 401, 'UNAUTHORIZED');
  }

  try {
    const user = jwt.verify(token, env.JWT_SECRET);
    user.roles = normalizeRoles(user.roles, { fallback: 'member' });
    user.role = getPrimaryRole(user.roles, { fallback: 'member' });
    req.user = user;
    next();
  } catch (err) {
    return error(res, 'Invalid or expired token.', 403, 'INVALID_TOKEN');
  }
};

const optionalAuthenticateUser = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const user = jwt.verify(token, env.JWT_SECRET);
    user.roles = normalizeRoles(user.roles, { fallback: 'member' });
    user.role = getPrimaryRole(user.roles, { fallback: 'member' });
    req.user = user;
    next();
  } catch (err) {
    return error(res, 'Invalid or expired token.', 403, 'INVALID_TOKEN');
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return error(res, 'Permissions denied.', 403, 'FORBIDDEN');
    }

    const normalizedUserRoles = normalizeRoles(req.user.roles, { fallback: 'member' });
    const normalizedAllowedRoles = normalizeRoles(roles, { fallback: '' });
    const hasRole = normalizedUserRoles.some((role) => normalizedAllowedRoles.includes(role));

    if (!hasRole) {
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
};

module.exports = {
  authenticateUser,
  optionalAuthenticateUser,
  authorizeRoles,
};
