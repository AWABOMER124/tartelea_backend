const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../utils/logger');

const poolConfig = env.DATABASE_URL
  ? {
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    };

const pool = new Pool(poolConfig);

const dbTarget = env.DATABASE_URL
  ? 'DATABASE_URL'
  : `${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
console.log(`🔗 [DB] Attempting connection: ${dbTarget}`);

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
