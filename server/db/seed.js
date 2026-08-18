/**
 * @file db/seed.js
 * @description Seed the database with a default admin user.
 * Run: node db/seed.js
 */

const bcrypt = require('bcryptjs');
const { pool } = require('./pool');

async function seed() {
    try {
        const hash = await bcrypt.hash('admin123', 10);
        await pool.query(`
            INSERT INTO users (username, email, password_hash, role)
            VALUES ('admin', 'admin@ydb.io', $1, 'admin')
            ON CONFLICT (username) DO NOTHING
        `, [hash]);

        console.log('[SEED] Default admin user created.');
        console.log('       Username: admin');
        console.log('       Password: admin123');
    } catch (err) {
        console.error('[SEED] Error:', err.message);
    } finally {
        await pool.end();
    }
}

seed();
