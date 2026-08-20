/**
 * @file db/reset-admin.js
 * @description Reset admin password — generates a new random password and forces change on login.
 * Run: node db/reset-admin.js
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./pool');

function generateSecurePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    const parts = [];
    for (let s = 0; s < 4; s++) {
        let seg = '';
        for (let i = 0; i < 4; i++) {
            seg += chars[crypto.randomInt(0, chars.length)];
        }
        parts.push(seg);
    }
    return parts.join('-');
}

async function resetAdmin() {
    try {
        const password = generateSecurePassword();
        const hash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            "UPDATE users SET password_hash = $1, force_password_change = true WHERE username = 'admin' RETURNING id",
            [hash]
        );

        if (!result.rows.length) {
            console.error('[RESET] No admin user found. Run db:seed first.');
            process.exit(1);
        }

        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║   yDB — Admin Password Reset                                ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log(`║   New Password: ${password.padEnd(42)}║`);
        console.log('║                                                              ║');
        console.log('║   ⚠  SAVE THIS PASSWORD — it will NOT be shown again.       ║');
        console.log('║   ⚠  You will be required to change it on first login.      ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('');
    } catch (err) {
        console.error('[RESET] Error:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

resetAdmin();
