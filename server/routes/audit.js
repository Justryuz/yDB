/**
 * @file routes/audit.js
 * @description Audit log API — read-only and export.
 * No UPDATE or DELETE endpoints exist. Audit logs are immutable.
 * Admin role can read and export but NEVER modify or delete.
 */

const express = require('express');
const router = express.Router();
const db = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

/** GET /api/audit — List audit logs (paginated, filterable) */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = Math.min(parseInt(req.query.perPage) || 50, 200);
        const offset = (page - 1) * perPage;
        const { search, action, userId, status, from, to } = req.query;

        let query = `SELECT a.*, u.username
                     FROM audit_log a
                     LEFT JOIN users u ON a.user_id = u.id`;
        const conditions = [];
        const params = [];

        if (search) {
            params.push('%' + search + '%');
            conditions.push(`(a.query_text ILIKE $${params.length} OR a.action ILIKE $${params.length} OR a.resource ILIKE $${params.length})`);
        }
        if (action) {
            params.push(action);
            conditions.push(`a.action = $${params.length}`);
        }
        if (userId) {
            params.push(parseInt(userId));
            conditions.push(`a.user_id = $${params.length}`);
        }
        if (status) {
            params.push(status);
            conditions.push(`a.result_status = $${params.length}`);
        }
        if (from) {
            params.push(from);
            conditions.push(`a.created_at >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            conditions.push(`a.created_at <= $${params.length}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        // Get total count
        const countQuery = query.replace(/SELECT a\.\*, u\.username/, 'SELECT COUNT(*) as total');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0]?.total || 0);

        query += ' ORDER BY a.created_at DESC';
        params.push(perPage);
        query += ` LIMIT $${params.length}`;
        params.push(offset);
        query += ` OFFSET $${params.length}`;

        const result = await db.query(query, params);
        res.json({ data: result.rows, page, perPage, total, totalPages: Math.ceil(total / perPage) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/audit/export — Export audit logs as JSON (admin only) */
router.get('/export', authorize('admin'), async (req, res) => {
    try {
        const { from, to } = req.query;
        let query = 'SELECT * FROM audit_log';
        const params = [];

        if (from || to) {
            const conditions = [];
            if (from) { params.push(from); conditions.push(`created_at >= $${params.length}`); }
            if (to) { params.push(to); conditions.push(`created_at <= $${params.length}`); }
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY created_at ASC';

        const result = await db.query(query, params);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit_log_export_${new Date().toISOString().slice(0, 10)}.json"`);
        res.json({
            exported_at: new Date().toISOString(),
            total_records: result.rows.length,
            records: result.rows
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/audit/stats — Audit log statistics (admin only) */
router.get('/stats', authorize('admin'), async (req, res) => {
    try {
        const stats = await db.query(`
            SELECT
                COUNT(*) as total_entries,
                COUNT(DISTINCT user_id) as unique_users,
                MIN(created_at) as earliest_entry,
                MAX(created_at) as latest_entry,
                COUNT(*) FILTER (WHERE result_status = 'failure') as failures,
                COUNT(*) FILTER (WHERE result_status = 'success') as successes
            FROM audit_log
        `);

        const recentActions = await db.query(`
            SELECT action, COUNT(*) as count
            FROM audit_log
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY action ORDER BY count DESC LIMIT 10
        `);

        res.json({
            summary: stats.rows[0],
            last_24h_actions: recentActions.rows
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
// NO DELETE OR UPDATE ENDPOINTS — AUDIT LOG IS IMMUTABLE
// Attempting to DELETE FROM audit_log will be blocked by PostgreSQL rules.
// ═══════════════════════════════════════════════════════════════════════

module.exports = router;
