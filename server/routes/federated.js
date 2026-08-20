/**
 * @file routes/federated.js
 * @description Federated query execution via DuckDB — joins data from multiple database connections.
 * Fetches data from each source, loads into DuckDB temp tables, executes real SQL JOIN.
 * Supports 10+ databases in a single query.
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
const FederatedEngine = require('../services/federated-engine');

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
 * POST /api/federated/execute
 * Body: {
 *   sources: [
 *     { connectionId, table, columns: ['col1','col2'] },
 *     ...
 *   ],
 *   join: { leftIdx: 0, leftCol: 'id', rightIdx: 1, rightCol: 'user_id', type: 'INNER' },
 *   sql: "(optional) Custom SQL to run against DuckDB after loading all sources"
 * }
 */
router.post('/execute', async (req, res) => {
    try {
        const { sources, join, sql: customSql } = req.body;
        if (!sources || sources.length < 1) {
            return res.status(400).json({ error: 'At least one source required' });
        }

        // Fetch data from each source in parallel
        const datasets = await Promise.all(sources.map(async (source, idx) => {
            const connResult = await db.query(
                'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
                [source.connectionId, req.user.id]
            );
            if (!connResult.rows.length) {
                throw new Error(`Connection ${source.connectionId} not found`);
            }

            const conn = connResult.rows[0];
            const password = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
            const options = conn.options || {};

            const { opts, cleanup } = await withTunnel(
                { host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name },
                options.ssh
            );

            try {
                const adapter = await poolManager.getAdapter(source.connectionId, conn.db_type, opts);
                const cols = source.columns && source.columns.length ? source.columns.join(', ') : '*';
                const fetchSql = `SELECT ${cols} FROM ${source.table} LIMIT 10000`;
                const result = await adapter.query(fetchSql);
                return {
                    name: source.table,
                    columns: result.columns,
                    data: result.data
                };
            } finally {
                cleanup();
            }
        }));

        // Use DuckDB for the join
        const engine = new FederatedEngine();

        let result;
        if (customSql) {
            // User provided custom SQL — execute directly against DuckDB
            result = await engine.execute(datasets, customSql);
        } else if (join && datasets.length >= 2) {
            // Standard join between 2 sources
            const leftDs = datasets[join.leftIdx || 0];
            const rightDs = datasets[join.rightIdx || 1];
            result = await engine.join(leftDs, rightDs, {
                leftCol: join.leftCol,
                rightCol: join.rightCol,
                type: join.type || 'INNER'
            });
        } else {
            // Single source — just return as-is
            const d = datasets[0];
            result = { columns: d.columns, data: d.data, duration: 0, rowCount: d.data.length };
        }

        // Apply server-side masking
        const masked = applyMasking(result, req.user.role);

        // Audit log
        const { logFromRequest } = require('../services/audit-log');
        await logFromRequest(req, 'query.federated', 'query', {
            queryText: 'FEDERATED: ' + sources.map(s => s.table).join(' + '),
            status: 'success',
            durationMs: result.duration,
            rowsAffected: result.rowCount,
            details: { sources: sources.map(s => ({ connectionId: s.connectionId, table: s.table })) }
        });

        res.json(masked);

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
