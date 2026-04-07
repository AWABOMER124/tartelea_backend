const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function setupDatabase() {
    const client = await pool.connect();
    try {
        console.log('🚀 [DB SETUP] Starting comprehensive database reconstruction...');
        
        const schemaPath = path.join(__dirname, '../src/db/schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute the entire schema
        await client.query(schemaSql);
        
        console.log('✅ [DB SETUP] Successfully created all tables, extensions, and constraints.');
        console.log('📝 Tables expected: users, user_roles, profiles, posts, contents, comments, subscriptions, workshops');
        
    } catch (err) {
        console.error('❌ [DB SETUP] Critical error during database initialization:', err.message);
        console.error('Stack:', err.stack);
    } finally {
        client.release();
        process.exit(0);
    }
}

setupDatabase();
