const jwt = require('jsonwebtoken');
const env = require('../config/env');

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.warn(`[AUTH] 401 Unauthorized - No token provided for ${req.method} ${req.originalUrl}`);
    return res.status(401).json({
      success: false,
      error: { message: 'Access denied. No token provided.', code: 'UNAUTHORIZED' }
    });
  }

  try {
    const user = jwt.verify(token, env.JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      error: { message: 'Invalid or expired token.', code: 'INVALID_TOKEN' }
    });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(403).json({
        success: false,
        error: { message: 'Permissions denied.', code: 'FORBIDDEN' }
      });
    }

    const hasRole = req.user.roles.some((role) => roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        error: { message: `Access denied. Requires one of: ${roles.join(', ')}`, code: 'FORBIDDEN' }
      });
    }
    next();
  };
};

module.exports = {
  authenticateUser,
  authorizeRoles,
};
