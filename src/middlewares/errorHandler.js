const logger = require('../utils/logger');
const env = require('../config/env');

const errorHandler = (err, req, res, next) => {
  logger.error(`${err.name}: ${err.message}`, { stack: err.stack });

  const statusCode = err.status || 500;
  const message = statusCode === 500 && env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message;

  res.status(statusCode).json({
    success: false,
    message: message,
    code: err.code || 'INTERNAL_ERROR',
    details: env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

module.exports = errorHandler;
