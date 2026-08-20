/**
 * @file routes/query.js
 * @description Execute SQL queries against user's saved connections.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db/pool');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { applyMasking } = require('../middleware/masking');
const poolManager = require('../services/pool-manager');
const { withTunnel } = require('../services/ssh-tunnel');

router.use(authenticate);

function decrypt(text) {
    const key = crypto.scryptSync(config.encryptionKey, 'salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * POST /api/query/execute
 * Body: { connectionId, sql }
 */
router.post('/execute', async (req, res) => {
    try {
        const { connectionId, sql } = req.body;
        if (!connectionId || !sql) {
            return res.status(400).json({ error: 'connectionId and sql required' });
        }

        const connResult = await db.query(
            'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
            [connectionId, req.user.id]
        );
        if (!connResult.rows.length) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const conn = connResult.rows[0];
        const password = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
        const options = conn.options || {};

        // Strip ONLY the active connection's database prefix from SQL
        // (handles copy-pasted cross-DB SQL when executing against single connection)
        let cleanSql = sql.replace(/^--.*$/gm, '').trim();
        if (conn.database_name) {
            const prefix = new RegExp(conn.database_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.', 'gi');
            cleanSql = cleanSql.replace(prefix, '');
        }

        // Apply SSH tunnel if configured
        const { opts, cleanup } = await withTunnel(
            { host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name },
            options.ssh
        );

        try {
            // Use pool manager for persistent connections
            const adapter = await poolManager.getAdapter(connectionId, conn.db_type, opts);
            const result = await adapter.query(cleanSql);

            // Apply server-side masking based on role
            const maskedResult = applyMasking(result, req.user.role);

            // Log to audit
            await db.query(
                'INSERT INTO audit_log (user_id, connection_id, sql_text, status, duration_ms, rows_affected) VALUES ($1, $2, $3, $4, $5, $6)',
                [req.user.id, connectionId, sql, 'success', result.duration || 0, result.rowCount || 0]
            );

            res.json(maskedResult);
        } catch (queryErr) {
            // Log failed query
            await db.query(
                'INSERT INTO audit_log (user_id, connection_id, sql_text, status, error_message) VALUES ($1, $2, $3, $4, $5)',
                [req.user.id, connectionId, sql, 'error', queryErr.message]
            );
            // Release broken connection from pool
            await poolManager.release(connectionId);
            res.status(400).json({ error: queryErr.message });
        } finally {
            cleanup();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
