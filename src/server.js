const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { pool } = require('./db');

const port = env.PORT || 3000;
const server = http.createServer(app);

const startServer = async () => {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection established.');

    server.listen(port, '0.0.0.0', () => {
      logger.info(`Server is running on http://0.0.0.0:${port} in ${env.NODE_ENV} mode`);
    });
  } catch (err) {
    logger.error('Failed to connect to the database. Retrying in 5 seconds.', {
      error: err.message,
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
