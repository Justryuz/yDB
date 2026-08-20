/**
 * @file db/seed.js
 * @description First-run setup: creates the initial admin user with a randomly
 * generated password, printed once to stdout. The admin is forced to change it
 * on first login via the `force_password_change` flag.
 *
 * Run: node db/seed.js
 *
 * This script:
 *  1. Checks if ANY admin user already exists.
 *  2. If yes — exits (idempotent, safe to run multiple times).
 *  3. If no — generates a cryptographically random password, inserts the admin,
 *     and prints the one-time password to the console.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./pool');

/**
 * Generate a secure random password.
 * Format: 4 groups of 4 alphanumeric chars separated by dashes (e.g., A3xF-9kLm-Qr2t-Vb8N)
 */
function generateSecurePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    const segments = 4;
    const segLen = 4;
    const parts = [];
    for (let s = 0; s < segments; s++) {
        let seg = '';
        for (let i = 0; i < segLen; i++) {
            const idx = crypto.randomInt(0, chars.length);
            seg += chars[idx];
        }
        parts.push(seg);
    }
    return parts.join('-');
}

async function seed() {
    try {
        // Check if an admin user already exists
        const existing = await pool.query(
            "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
        );

        if (existing.rows.length > 0) {
            console.log('[SETUP] Admin user already exists. Skipping seed.');
            console.log('        If you need to reset the admin password, use: node db/reset-admin.js');
            await pool.end();
            return;
        }

        // Generate random password
        const password = generateSecurePassword();
        const hash = await bcrypt.hash(password, 12);

        await pool.query(`
            INSERT INTO users (username, email, password_hash, role, force_password_change)
            VALUES ('admin', 'admin@ydb.local', $1, 'admin', true)
            ON CONFLICT (username) DO UPDATE SET
                password_hash = $1,
                force_password_change = true
        `, [hash]);

        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║   yDB — Initial Admin Account Created                       ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log('║                                                              ║');
        console.log(`║   Username: admin                                            ║`);
        console.log(`║   Password: ${password.padEnd(46)}║`);
        console.log('║                                                              ║');
        console.log('║   ⚠  SAVE THIS PASSWORD — it will NOT be shown again.       ║');
        console.log('║   ⚠  You will be required to change it on first login.      ║');
        console.log('║                                                              ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('');
    } catch (err) {
        console.error('[SEED] Error:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

seed();
