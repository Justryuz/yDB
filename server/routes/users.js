/**
 * @file routes/users.js
 * @description User management (admin only).
 * Enforces password policy on user creation.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { validatePassword } = require('../middleware/password-policy');
const { logAudit } = require('./auth');

router.use(authenticate);
router.use(authorize('admin'));

/** GET /api/users — List all users */
router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, username, email, role, active, force_password_change, created_at FROM users ORDER BY created_at'
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/users — Create user (password required, must meet policy) */
router.post('/', async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        // Enforce password policy
        const policyResult = validatePassword(password);
        if (!policyResult.valid) {
            return res.status(400).json({ error: 'Password does not meet policy requirements', details: policyResult.errors });
        }

        const validRoles = ['admin', 'editor', 'viewer'];
        const userRole = validRoles.includes(role) ? role : 'viewer';

        const hash = await bcrypt.hash(password, 12);
        const result = await db.query(
            'INSERT INTO users (username, email, password_hash, role, force_password_change) VALUES ($1, $2, $3, $4, true) RETURNING id, username, email, role',
            [username, email, hash, userRole]
        );

        await logAudit(req.user.id, 'user.created', 'users', null, null, req, 'success', {
            created_user: result.rows[0].username,
            role: userRole
        });

        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

/** PATCH /api/users/:id — Toggle active or change role */
router.patch('/:id', async (req, res) => {
    try {
        const { active, role } = req.body;
        const changes = {};

        if (active !== undefined) {
            await db.query('UPDATE users SET active = $1, updated_at = NOW() WHERE id = $2', [active, req.params.id]);
            changes.active = active;
        }
        if (role) {
            const validRoles = ['admin', 'editor', 'viewer'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Invalid role' });
            }
            await db.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, req.params.id]);
            changes.role = role;
        }

        await logAudit(req.user.id, 'user.updated', 'users', null, null, req, 'success', {
            target_user_id: parseInt(req.params.id),
            changes
        });

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/users/:id */
router.delete('/:id', async (req, res) => {
    try {
        // Prevent self-deletion
        if (parseInt(req.params.id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);

        await logAudit(req.user.id, 'user.deleted', 'users', null, null, req, 'success', {
            deleted_user_id: parseInt(req.params.id)
        });

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
