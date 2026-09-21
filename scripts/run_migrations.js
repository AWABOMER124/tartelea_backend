const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../src/db');

const migrationsDir = path.join(__dirname, '..', 'migrations');

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = fs.readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    for (const filename of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      const hash = checksum(sql);
      const existing = await client.query(
        'SELECT checksum FROM schema_migrations WHERE filename = $1',
        [filename]
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum !== hash) {
          throw new Error(`Applied migration was modified: ${filename}`);
        }
        console.log(`[MIGRATE] skip ${filename}`);
        continue;
      }

      console.log(`[MIGRATE] apply ${filename}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, hash]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('[MIGRATE] database is up to date');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error('[MIGRATE] failed:', error.message);
  process.exitCode = 1;
});
