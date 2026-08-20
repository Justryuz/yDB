/**
 * @file routes/query.js
 * @description Execute SQL queries against user's saved connections.
 * Supports execution tracking and cancellation via execution IDs.
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../db/pool');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { applyMasking } = require('../middleware/masking');
const poolManager = require('../services/pool-manager');
const { withTunnel } = require('../services/ssh-tunnel');
const { logFromRequest } = require('../services/audit-log');

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

/** Track active query executions for cancellation */
const activeExecutions = new Map();

/**
 * POST /api/query/execute
 * Body: { connectionId, sql }
 * Returns: { executionId, columns, data, duration, rowCount }
 */
router.post('/execute', async (req, res) => {
    const executionId = uuidv4();

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

        let cleanSql = sql.replace(/^--.*$/gm, '').trim();
        if (conn.database_name) {
            const prefix = new RegExp(conn.database_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.', 'gi');
            cleanSql = cleanSql.replace(prefix, '');
        }

        const { opts, cleanup } = await withTunnel(
            { host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name },
            options.ssh
        );

        // Record execution for cancellation tracking
        await db.query(
            'INSERT INTO query_executions (id, user_id, connection_id, sql_text, status) VALUES ($1, $2, $3, $4, $5)',
            [executionId, req.user.id, connectionId, sql, 'running']
        );

        // Store execution context for cancellation
        activeExecutions.set(executionId, {
            userId: req.user.id,
            connectionId,
            dbType: conn.db_type,
            adapter: null, // Will be set after getting adapter
            cancelled: false
        });

        try {
            const adapter = await poolManager.getAdapter(connectionId, conn.db_type, opts);

            // Update execution context with adapter reference
            const execCtx = activeExecutions.get(executionId);
            if (execCtx) execCtx.adapter = adapter;

            // Check if cancelled before executing
            if (execCtx && execCtx.cancelled) {
                throw new Error('Query cancelled before execution');
            }

            const start = Date.now();
            const result = await adapter.query(cleanSql);
            const duration = Date.now() - start;

            // Mark completed
            await db.query(
                'UPDATE query_executions SET status = $1, completed_at = NOW() WHERE id = $2',
                ['completed', executionId]
            );
            activeExecutions.delete(executionId);

            // Apply server-side masking based on role
            const maskedResult = applyMasking(result, req.user.role);

            // Audit log
            await logFromRequest(req, 'query.executed', 'query', {
                connectionId,
                queryText: sql,
                status: 'success',
                durationMs: duration,
                rowsAffected: result.rowCount || 0
            });

            res.json({ executionId, ...maskedResult });
        } catch (queryErr) {
            const isCancelled = queryErr.message.includes('cancel') ||
                                queryErr.message.includes('57014') || // PG query_canceled
                                (activeExecutions.get(executionId)?.cancelled);

            const status = isCancelled ? 'cancelled' : 'error';

            await db.query(
                'UPDATE query_executions SET status = $1, completed_at = NOW() WHERE id = $2',
                [status, executionId]
            );
            activeExecutions.delete(executionId);

            // Audit log
            await logFromRequest(req, isCancelled ? 'query.cancelled' : 'query.error', 'query', {
                connectionId,
                queryText: sql,
                status,
                errorMessage: queryErr.message
            });

            await poolManager.release(connectionId);
            res.status(isCancelled ? 499 : 400).json({ error: queryErr.message, status });
        } finally {
            cleanup();
        }
    } catch (err) {
        activeExecutions.delete(executionId);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/query/:executionId/cancel
 * Cancel a running query. Sends native cancel signal where supported.
 */
router.post('/:executionId/cancel', async (req, res) => {
    const { executionId } = req.params;

    try {
        // Verify the execution belongs to this user
        const execResult = await db.query(
            'SELECT * FROM query_executions WHERE id = $1 AND user_id = $2 AND status = $3',
            [executionId, req.user.id, 'running']
        );

        if (!execResult.rows.length) {
            return res.status(404).json({ error: 'Running execution not found' });
        }

        const execution = execResult.rows[0];
        const execCtx = activeExecutions.get(executionId);

        if (execCtx) {
            execCtx.cancelled = true;

            // Attempt native cancellation based on DB type
            try {
                if (execCtx.adapter && execCtx.adapter.cancel) {
                    await execCtx.adapter.cancel();
                } else if (execution.backend_pid && ['postgresql', 'postgres'].includes(execCtx.dbType)) {
                    // PostgreSQL: use pg_cancel_backend
                    await db.query('SELECT pg_cancel_backend($1)', [execution.backend_pid]);
                } else if (execCtx.adapter && execCtx.adapter.connection) {
                    // Generic: destroy the connection to force abort
                    if (typeof execCtx.adapter.connection.destroy === 'function') {
                        execCtx.adapter.connection.destroy();
                    }
                }
            } catch (cancelErr) {
                console.warn(`[Query] Native cancel failed for ${executionId}:`, cancelErr.message);
            }
        }

        // Update status
        await db.query(
            'UPDATE query_executions SET status = $1, completed_at = NOW() WHERE id = $2',
            ['cancelled', executionId]
        );

        // Audit log
        await logFromRequest(req, 'query.cancelled', 'query', {
            connectionId: execution.connection_id,
            status: 'cancelled',
            details: { executionId }
        });

        // Release the connection from pool (it may be in a bad state)
        if (execution.connection_id) {
            await poolManager.release(execution.connection_id);
        }

        activeExecutions.delete(executionId);
        res.json({ success: true, message: 'Query cancellation requested', executionId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/query/executions
 * List current user's recent query executions.
 */
router.get('/executions', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, connection_id, sql_text, status, started_at, completed_at
             FROM query_executions
             WHERE user_id = $1
             ORDER BY started_at DESC
             LIMIT 50`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export for stream route to use
module.exports = router;
module.exports.activeExecutions = activeExecutions;
