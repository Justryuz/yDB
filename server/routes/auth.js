/**
 * @file routes/auth.js
 * @description Auth endpoints: login, register, change-password, refresh, me.
 * Enforces password policy on registration and password changes.
 * Handles force_password_change flag for first-login flows.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db/pool');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { validatePassword } = require('../middleware/password-policy');

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns token + user info. If force_password_change is true,
 * the response includes a flag and a limited-scope token.
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const result = await db.query(
            'SELECT id, username, email, password_hash, role, active, force_password_change FROM users WHERE username = $1',
            [username]
        );

        if (!result.rows.length) {
            // Log failed login attempt
            await logAudit(null, 'auth.login_failed', 'auth', null, null, req, 'failure', { username });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        if (!user.active) {
            await logAudit(user.id, 'auth.login_disabled', 'auth', null, null, req, 'failure');
            return res.status(403).json({ error: 'Account is disabled' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            await logAudit(user.id, 'auth.login_failed', 'auth', null, null, req, 'failure');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Successful login
        await logAudit(user.id, 'auth.login_success', 'auth', null, null, req, 'success');

        // If forced password change, issue a limited token
        if (user.force_password_change) {
            const limitedToken = jwt.sign(
                { id: user.id, username: user.username, role: user.role, scope: 'password_change' },
                config.jwt.secret,
                { expiresIn: '15m' }
            );
            return res.json({
                token: limitedToken,
                forcePasswordChange: true,
                user: { id: user.id, username: user.username, email: user.email, role: user.role }
            });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn }
        );

        const refreshToken = jwt.sign(
            { id: user.id },
            config.jwt.secret + '_refresh',
            { expiresIn: '30d' }
        );

        res.json({
            token,
            refreshToken,
            user: { id: user.id, username: user.username, email: user.email, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/auth/register
 * Body: { username, email, password }
 * Enforces password policy. Only available after initial setup is complete.
 */
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields required' });
        }

        // Enforce password policy
        const policyResult = validatePassword(password);
        if (!policyResult.valid) {
            return res.status(400).json({ error: 'Password does not meet requirements', details: policyResult.errors });
        }

        const hash = await bcrypt.hash(password, 12);
        const result = await db.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, role',
            [username, email, hash]
        );

        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn }
        );

        await logAudit(user.id, 'auth.register', 'users', null, null, req, 'success');
        res.status(201).json({ token, user });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 * Enforces password policy on the new password.
 * Clears force_password_change flag on success.
 */
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password required' });
        }

        // Validate new password against policy
        const policyResult = validatePassword(newPassword);
        if (!policyResult.valid) {
            return res.status(400).json({ error: 'New password does not meet requirements', details: policyResult.errors });
        }

        // Verify current password
        const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (!userResult.rows.length) {
            return res.status(404).json({ error: 'User not found' });
        }

        const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Update password and clear force flag
        const newHash = await bcrypt.hash(newPassword, 12);
        await db.query(
            'UPDATE users SET password_hash = $1, force_password_change = false, updated_at = NOW() WHERE id = $2',
            [newHash, req.user.id]
        );

        await logAudit(req.user.id, 'auth.password_changed', 'users', null, null, req, 'success');

        // Issue a full token now that password is changed
        const token = jwt.sign(
            { id: req.user.id, username: req.user.username, role: req.user.role },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn }
        );

        res.json({ success: true, token, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * Returns new access token.
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

        const payload = jwt.verify(refreshToken, config.jwt.secret + '_refresh');

        const result = await db.query('SELECT id, username, role, active FROM users WHERE id = $1', [payload.id]);
        if (!result.rows.length || !result.rows[0].active) {
            return res.status(403).json({ error: 'Account disabled or not found' });
        }

        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn }
        );

        res.json({ token });
    } catch (err) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

/**
 * GET /api/auth/me
 * Returns current user info.
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, username, email, role, force_password_change, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/auth/setup-status
 * Public endpoint — indicates whether initial setup is complete.
 */
router.get('/setup-status', async (req, res) => {
    try {
        const result = await db.query('SELECT setup_complete FROM app_setup WHERE id = 1');
        const setupComplete = result.rows.length > 0 && result.rows[0].setup_complete;
        res.json({ setupComplete });
    } catch (err) {
        // Table might not exist yet
        res.json({ setupComplete: false });
    }
});

/**
 * POST /api/auth/complete-setup
 * Called after admin changes password on first login.
 * Marks the app as fully set up.
 */
router.post('/complete-setup', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admin can complete setup' });
        }

        await db.query(
            'UPDATE app_setup SET setup_complete = true, completed_at = NOW(), completed_by = $1 WHERE id = 1',
            [req.user.id]
        );

        await logAudit(req.user.id, 'system.setup_completed', 'system', null, null, req, 'success');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Helper: log to audit_log table.
 */
async function logAudit(userId, action, resource, connectionId, queryText, req, status, details = {}) {
    try {
        const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || null) : null;
        await db.query(
            `INSERT INTO audit_log (user_id, action, resource, connection_id, query_text, ip_address, result_status, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [userId, action, resource, connectionId, queryText, ip, status, JSON.stringify(details)]
        );
    } catch (err) {
        console.error('[Audit] Failed to write audit log:', err.message);
    }
}

module.exports = router;
module.exports.logAudit = logAudit;
