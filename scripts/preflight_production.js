const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (process.env.NODE_ENV !== 'production') {
  console.error('[PREFLIGHT] NODE_ENV must be production.');
  process.exit(1);
}

const env = require('../src/config/env');
const { pool } = require('../src/db');

const migrationsDir = path.join(__dirname, '..', 'migrations');
const uploadDir = path.join(__dirname, '..', 'uploads');
const requiredTables = [
  'users',
  'profiles',
  'user_roles',
  'trainer_courses',
  'workshops',
  'rooms',
  'room_recordings',
  'trainer_services',
  'service_bookings',
  'service_reviews',
];

const checksum = (content) =>
  crypto.createHash('sha256').update(content).digest('hex');

const errors = [];
const warnings = [];

function ok(label) {
  console.log(`[PREFLIGHT][OK] ${label}`);
}

function fail(label) {
  errors.push(label);
  console.error(`[PREFLIGHT][FAIL] ${label}`);
}

function warn(label) {
  warnings.push(label);
  console.warn(`[PREFLIGHT][WARN] ${label}`);
}

async function checkDatabase(client) {
  await client.query('SELECT 1');
  ok('Database connection');

  const tableResult = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [requiredTables]
  );

  const present = new Set(tableResult.rows.map((row) => row.table_name));
  for (const table of requiredTables) {
    if (!present.has(table)) {
      fail(`Missing required table: ${table}`);
    }
  }
  if (requiredTables.every((table) => present.has(table))) {
    ok('Required production tables');
  }

  const migrationTable = await client.query(
    `
      SELECT to_regclass('public.schema_migrations') AS table_name
    `
  );

  if (!migrationTable.rows[0]?.table_name) {
    fail('schema_migrations table is missing; run npm run migrate:db');
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const applied = await client.query(
    'SELECT filename, checksum FROM schema_migrations'
  );
  const appliedMap = new Map(
    applied.rows.map((row) => [row.filename, row.checksum])
  );

  for (const filename of files) {
    const content = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    const expected = checksum(content);
    const actual = appliedMap.get(filename);

    if (!actual) {
      fail(`Pending migration: ${filename}`);
      continue;
    }
    if (actual !== expected) {
      fail(`Migration checksum mismatch: ${filename}`);
    }
  }

  if (
    files.every((filename) => {
      const content = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      return appliedMap.get(filename) === checksum(content);
    })
  ) {
    ok('All migrations applied with matching checksums');
  }
}

function checkRuntimeStorage() {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.accessSync(uploadDir, fs.constants.R_OK | fs.constants.W_OK);
    ok('Upload directory is readable/writable');
  } catch (error) {
    fail(`Upload directory is not writable: ${error.message}`);
  }

  warn('Verify /app/uploads is backed by persistent storage in the deployment platform.');
}

function checkIntegrations() {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    fail('LiveKit production configuration is incomplete.');
  } else {
    ok('LiveKit configuration');
  }

  if (!env.GOOGLE_CLIENT_ID) {
    warn('GOOGLE_CLIENT_ID is not configured; Google sign-in will be unavailable.');
  } else {
    ok('Google OAuth server client ID');
  }

  if (env.EMAIL_ENABLED) {
    ok('Email delivery is enabled and required SMTP keys passed env validation');
  } else {
    warn('EMAIL_ENABLED=false; verification/reset email delivery is intentionally disabled.');
  }

  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    warn('Cloudflare Stream is not configured; workshop streaming features that depend on it will be unavailable.');
  } else {
    ok('Cloudflare Stream configuration');
  }

  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET_KEY) {
    warn('PayPal is not configured.');
  } else {
    ok('PayPal configuration');
  }
}

async function run() {
  console.log('[PREFLIGHT] Starting production readiness checks...');
  checkRuntimeStorage();
  checkIntegrations();

  const client = await pool.connect();
  try {
    await checkDatabase(client);
  } finally {
    client.release();
    await pool.end();
  }

  console.log(
    `[PREFLIGHT] Completed with ${errors.length} error(s) and ${warnings.length} warning(s).`
  );

  if (warnings.length) {
    console.log('[PREFLIGHT] Warnings:');
    warnings.forEach((item) => console.log(`- ${item}`));
  }

  if (errors.length) {
    console.error('[PREFLIGHT] Blocking errors:');
    errors.forEach((item) => console.error(`- ${item}`));
    process.exit(1);
  }

  console.log('[PREFLIGHT] Production preflight passed.');
}

run().catch((error) => {
  console.error('[PREFLIGHT] Unexpected failure:', error.message);
  process.exit(1);
});
