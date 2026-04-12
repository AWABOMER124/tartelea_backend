const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { error } = require('../utils/response');

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.warn(`[AUTH] 401 Unauthorized - No token provided for ${req.method} ${req.originalUrl}`);
    return error(res, 'Access denied. No token provided.', 401, 'UNAUTHORIZED');
  }

  try {
    const user = jwt.verify(token, env.JWT_SECRET);
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

    const hasRole = req.user.roles.some((role) => roles.includes(role));
    if (!hasRole) {
      return error(res, `Access denied. Requires one of: ${roles.join(', ')}`, 403, 'FORBIDDEN');
    }
    next();
  };
};

module.exports = {
  authenticateUser,
  authorizeRoles,
};
