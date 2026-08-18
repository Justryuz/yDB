/**
 * @file routes/users.js
 * @description User management (admin only).
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('admin'));

/** GET /api/users — List all users */
router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT id, username, email, role, active, created_at FROM users ORDER BY created_at');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/users — Create user */
router.post('/', async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const hash = await bcrypt.hash(password || 'changeme', 10);
        const result = await db.query(
            'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
            [username, email, hash, role || 'viewer']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/users/:id — Toggle active or change role */
router.patch('/:id', async (req, res) => {
    try {
        const { active, role } = req.body;
        if (active !== undefined) await db.query('UPDATE users SET active = $1 WHERE id = $2', [active, req.params.id]);
        if (role) await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/users/:id */
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
