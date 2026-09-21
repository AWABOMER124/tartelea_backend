const crypto = require('crypto');
const logger = require('../utils/logger');

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function requestContext(req, res, next) {
  const incoming = req.get?.('x-request-id');
  const requestId =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : crypto.randomUUID();

  const startedAt = process.hrtime.bigint();

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const elapsedNs = process.hrtime.bigint() - startedAt;
    const durationMs = Number(elapsedNs) / 1e6;

    logger.info('HTTP request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: req.user?.id || null,
    });
  });

  next();
}

module.exports = requestContext;
