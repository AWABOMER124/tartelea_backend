const logger = require('../utils/logger');
const env = require('../config/env');
const { error } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  logger.error(`${err.name}: ${err.message}`, {
    requestId: req.id || null,
    method: req.method,
    path: req.originalUrl,
    statusCode: err.status || err.statusCode || 500,
    userId: req.user?.id || null,
    code: err.code || null,
    stack: err.stack,
  });

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return error(res, 'Invalid JSON body', 400, 'INVALID_JSON');
  }

  const statusCode = err.status || err.statusCode || 500;
  const message = statusCode === 500 && env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message;

  return error(res, message, statusCode, err.code || 'INTERNAL_ERROR');
};

module.exports = errorHandler;
