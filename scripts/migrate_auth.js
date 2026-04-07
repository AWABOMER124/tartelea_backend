const { pool } = require('../src/db');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🚀 [MIGRATION] Starting auth table migration...');
        
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
        `);
        
        console.log('✅ [MIGRATION] Successfully added reset_token columns to users table.');
    } catch (err) {
        console.error('❌ [MIGRATION] Error during migration:', err.message);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
