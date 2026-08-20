/**
 * @file routes/stream.js
 * @description SSE (Server-Sent Events) endpoint for streaming long-running query results.
 * Supports cancellation via execution ID.
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../db/pool');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const poolManager = require('../services/pool-manager');
const { withTunnel } = require('../services/ssh-tunnel');
const { logFromRequest } = require('../services/audit-log');

/** Track active streaming executions */
const activeStreams = new Map();

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
 * Returns SSE stream of query results with executionId in first event.
 */
router.get('/query', authenticate, async (req, res) => {
    const { connectionId, sql } = req.query;
    const batchSize = parseInt(req.query.batchSize) || 100;
    const executionId = uuidv4();

    if (!connectionId || !sql) {
        return res.status(400).json({ error: 'connectionId and sql required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    function send(event, data) {
        if (!aborted) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
    }

    let aborted = false;

    // Track this stream for cancellation
    activeStreams.set(executionId, { aborted: false, res });

    // Send execution ID first so client can cancel
    send('execution', { executionId });

    // Handle client disconnect or cancellation
    req.on('close', () => {
        aborted = true;
        activeStreams.delete(executionId);
    });

    try {
        // Record execution
        await db.query(
            'INSERT INTO query_executions (id, user_id, connection_id, sql_text, status) VALUES ($1, $2, $3, $4, $5)',
            [executionId, req.user.id, connectionId, sql, 'running']
        );

        const connResult = await db.query(
            'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
            [connectionId, req.user.id]
        );
        if (!connResult.rows.length) {
            send('error', { error: 'Connection not found' });
            res.end();
            activeStreams.delete(executionId);
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

            const result = await adapter.query(sql);

            // Check if cancelled during execution
            const streamCtx = activeStreams.get(executionId);
            if (aborted || (streamCtx && streamCtx.aborted)) {
                await db.query('UPDATE query_executions SET status = $1, completed_at = NOW() WHERE id = $2', ['cancelled', executionId]);
                await logFromRequest(req, 'query.cancelled', 'query', { connectionId: parseInt(connectionId), queryText: sql, status: 'cancelled' });
                cleanup();
                activeStreams.delete(executionId);
                res.end();
                return;
            }

            // Send columns
            send('columns', { columns: result.columns });

            // Stream data in batches
            const data = result.data;
            for (let i = 0; i < data.length; i += batchSize) {
                if (aborted || (activeStreams.get(executionId)?.aborted)) break;
                const batch = data.slice(i, i + batchSize);
                send('batch', { rows: batch, offset: i, total: data.length });
            }

            const duration = Date.now() - start;
            send('done', { duration, rowCount: data.length, executionId });

            // Mark completed
            await db.query('UPDATE query_executions SET status = $1, completed_at = NOW() WHERE id = $2', ['completed', executionId]);

            // Audit log
            await logFromRequest(req, 'query.executed', 'query', {
                connectionId: parseInt(connectionId),
                queryText: sql,
                status: 'success',
                durationMs: duration,
                rowsAffected: data.length
            });

            cleanup();
        } catch (queryErr) {
            send('error', { error: queryErr.message });
            await db.query('UPDATE query_executions SET status = $1, completed_at = NOW() WHERE id = $2', ['error', executionId]);
            await logFromRequest(req, 'query.error', 'query', {
                connectionId: parseInt(connectionId),
                queryText: sql,
                status: 'failure',
                errorMessage: queryErr.message
            });
            await poolManager.release(connectionId);
            cleanup();
        }
    } catch (err) {
        send('error', { error: err.message });
    }

    activeStreams.delete(executionId);
    res.end();
});

/**
 * POST /api/stream/cancel
 * Cancel a running streaming query.
 * Body: { executionId }
 */
router.post('/cancel', authenticate, async (req, res) => {
    const { executionId } = req.body;

    if (!executionId) {
        return res.status(400).json({ error: 'executionId required' });
    }

    // Verify ownership
    const execResult = await db.query(
        'SELECT * FROM query_executions WHERE id = $1 AND user_id = $2 AND status = $3',
        [executionId, req.user.id, 'running']
    );

    if (!execResult.rows.length) {
        return res.status(404).json({ error: 'Running execution not found' });
    }

    // Mark as cancelled
    const streamCtx = activeStreams.get(executionId);
    if (streamCtx) {
        streamCtx.aborted = true;
        // End the SSE response
        if (streamCtx.res && !streamCtx.res.writableEnded) {
            streamCtx.res.write(`event: cancelled\ndata: ${JSON.stringify({ executionId })}\n\n`);
            streamCtx.res.end();
        }
        activeStreams.delete(executionId);
    }

    await db.query('UPDATE query_executions SET status = $1, completed_at = NOW() WHERE id = $2', ['cancelled', executionId]);

    // Release connection from pool
    const execution = execResult.rows[0];
    if (execution.connection_id) {
        await poolManager.release(execution.connection_id);
    }

    await logFromRequest(req, 'query.cancelled', 'query', {
        connectionId: execution.connection_id,
        status: 'cancelled',
        details: { executionId }
    });

    res.json({ success: true, message: 'Stream cancelled', executionId });
});

module.exports = router;
