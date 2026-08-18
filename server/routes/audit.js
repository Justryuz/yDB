/**
 * @file routes/audit.js
 * @description Audit log API.
 */

const express = require('express');
const router = express.Router();
const db = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

/** GET /api/audit — List audit logs (paginated) */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = Math.min(parseInt(req.query.perPage) || 50, 200);
        const offset = (page - 1) * perPage;
        const search = req.query.search || '';

        let query = `SELECT a.*, u.username, c.name as connection_name
                     FROM audit_log a
                     LEFT JOIN users u ON a.user_id = u.id
                     LEFT JOIN connections c ON a.connection_id = c.id`;
        const params = [];

        if (search) {
            query += ' WHERE a.sql_text ILIKE $1';
            params.push('%' + search + '%');
        }

        query += ' ORDER BY a.executed_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(perPage, offset);

        const result = await db.query(query, params);
        res.json({ data: result.rows, page, perPage });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/audit — Clear audit log (admin) */
router.delete('/', async (req, res) => {
    try {
        await db.query('DELETE FROM audit_log');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
