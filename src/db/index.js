const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../utils/logger');

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

console.log(`🔗 [DB] Attempting connection: ${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);

pool.on('connect', () => {
  logger.info('✅ Successfully connected to the database.');
});

pool.on('error', (err) => {
  logger.error('❌ Unexpected database error on idle client:', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  pool,
};
