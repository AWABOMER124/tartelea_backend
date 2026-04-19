const http = require('http');
const env = require('./config/env');
const logger = require('./utils/logger');
const app = require('./app');
const { pool } = require('./db');
const { describeDbIssue, getDbTarget } = require('./utils/dbDiagnostics');

const port = env.PORT || 3000;
const server = http.createServer(app);

const startServer = async () => {
  if (env.NODE_ENV === 'production') {
    const warnings = [];

    const allowedOrigins = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (allowedOrigins.includes('*')) {
      warnings.push('ALLOWED_ORIGINS contains "*" (overly permissive for production).');
    }

    if (String(env.JWT_SECRET).toLowerCase().includes('change_me')) {
      warnings.push('JWT_SECRET looks like a placeholder value.');
    }

    if (!env.DATABASE_URL && String(env.DB_PASSWORD).toLowerCase().includes('change_me')) {
      warnings.push('DB_PASSWORD looks like a placeholder value.');
    }

    if (warnings.length) {
      logger.warn('Potentially insecure production environment detected.', { warnings });
    }
  }

  try {
    await pool.query('SELECT 1');
    logger.info('Database connection established.');
    logger.info('Backend environment loaded.', {
      nodeEnv: env.NODE_ENV,
      envFilePath: env.ENV_FILE_PATH,
      emailEnabled: env.EMAIL_ENABLED,
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
      autoVerifyEmail: env.AUTO_VERIFY_EMAIL,
      otpDevFallback: env.OTP_DEV_FALLBACK,
      subscriptionsPaused: env.SUBSCRIPTIONS_PAUSED,
      trainerEmailsConfigured: Boolean(env.TRAINER_EMAILS && env.TRAINER_EMAILS.trim()),
    });

    server.listen(port, '0.0.0.0', () => {
      logger.info(`Server is running on http://0.0.0.0:${port} in ${env.NODE_ENV} mode`);
    });
  } catch (err) {
    const issue = describeDbIssue(err, env);
    logger.error('Failed to connect to the database. Retrying in 5 seconds.', {
      error: err.message,
      code: err.code,
      summary: issue.summary,
      hints: issue.hints,
      target: getDbTarget(env),
      envFilePath: env.ENV_FILE_PATH,
      envLocalFileLoaded: env.ENV_LOCAL_FILE_LOADED,
    });
    setTimeout(startServer, 5000);
  }
};

const gracefulShutdown = async () => {
  logger.info('Received shutdown signal. Closing server...');
  server.close(() => {
    logger.info('HTTP server closed.');
    pool.end(() => {
      logger.info('Database pool closed.');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();
