const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log('[DB SETUP] Starting database setup...');

    const schemaPath = path.join(__dirname, '../schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    await client.query(schemaSql);

    console.log('[DB SETUP] Schema applied successfully.');
    console.log('[DB SETUP] Source: backend/schema.sql');
  } catch (err) {
    console.error('[DB SETUP] Failed to initialize database:', err.message);
    console.error('Stack:', err.stack);
  } finally {
    client.release();
    process.exit(0);
  }
}

setupDatabase();
