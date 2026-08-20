/**
 * @file routes/stream.js
 * @description SSE (Server-Sent Events) endpoint for streaming long-running query results.
 *
 * Client connects via EventSource:
 *   const es = new EventSource('/api/stream/query?connectionId=1&sql=SELECT...')
 *   es.onmessage = (e) => { const data = JSON.parse(e.data); }
 *
 * Events sent:
 *   - "columns": { columns: [...] } — sent once at start
 *   - "row": { row: {...} } — sent per row (for streaming)
 *   - "batch": { rows: [...], total: n } — sent in batches (default mode)
 *   - "done": { duration, rowCount } — query complete
 *   - "error": { error: "message" } — on failure
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db/pool');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const poolManager = require('../services/pool-manager');
const { withTunnel } = require('../services/ssh-tunnel');

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
 * GET /api/stream/query
 * Query params: connectionId, sql, batchSize (optional, default 100)
 * Returns SSE stream of query results.
 */
router.get('/query', authenticate, async (req, res) => {
    const { connectionId, sql } = req.query;
    const batchSize = parseInt(req.query.batchSize) || 100;

    if (!connectionId || !sql) {
        return res.status(400).json({ error: 'connectionId and sql required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Helper to send SSE event
    function send(event, data) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    // Handle client disconnect
    let aborted = false;
    req.on('close', () => { aborted = true; });

    try {
        // Get connection
        const connResult = await db.query(
            'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
            [connectionId, req.user.id]
        );
        if (!connResult.rows.length) {
            send('error', { error: 'Connection not found' });
            res.end();
            return;
        }

        const conn = connResult.rows[0];
        const password = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
        const options = conn.options || {};

        const { opts, cleanup } = await withTunnel(
            { host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name },
            options.ssh
        );

        try {
            const adapter = await poolManager.getAdapter(connectionId, conn.db_type, opts);
            const start = Date.now();

            // Execute query
            const result = await adapter.query(sql);

            if (aborted) { cleanup(); return; }

            // Send columns first
            send('columns', { columns: result.columns });

            // Stream data in batches
            const data = result.data;
            for (let i = 0; i < data.length; i += batchSize) {
                if (aborted) break;
                const batch = data.slice(i, i + batchSize);
                send('batch', { rows: batch, offset: i, total: data.length });
            }

            // Done
            const duration = Date.now() - start;
            send('done', { duration, rowCount: data.length });

            // Audit log
            await db.query(
                'INSERT INTO audit_log (user_id, connection_id, sql_text, status, duration_ms, rows_affected) VALUES ($1, $2, $3, $4, $5, $6)',
                [req.user.id, connectionId, sql, 'success', duration, data.length]
            );

            cleanup();
        } catch (queryErr) {
            send('error', { error: queryErr.message });
            await poolManager.release(connectionId);
            cleanup();
        }
    } catch (err) {
        send('error', { error: err.message });
    }

    res.end();
});

/**
 * POST /api/stream/cancel
 * Cancel a running query (for future use with async query execution)
 */
router.post('/cancel', authenticate, (req, res) => {
    // Placeholder for query cancellation
    res.json({ success: true, message: 'Query cancellation requested' });
});

module.exports = router;
