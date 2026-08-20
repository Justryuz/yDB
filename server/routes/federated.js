/**
 * @file routes/federated.js
 * @description Federated query execution — joins data from multiple database connections.
 * Splits query into sub-queries per connection, fetches data, joins in-memory.
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
 * POST /api/federated/execute
 * Body: {
 *   sources: [
 *     { connectionId, table, columns: ['col1','col2'] },
 *     { connectionId, table, columns: ['col1','col2'] }
 *   ],
 *   join: { leftIdx: 0, leftCol: 'id', rightIdx: 1, rightCol: 'user_id', type: 'INNER' }
 * }
 *
 * Executes sub-queries against each connection, then joins results in-memory.
 */
router.post('/execute', async (req, res) => {
    try {
        const { sources, join } = req.body;
        if (!sources || sources.length < 1) {
            return res.status(400).json({ error: 'At least one source required' });
        }

        // Fetch data from each source
        const datasets = [];
        for (const source of sources) {
            const connResult = await db.query(
                'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
                [source.connectionId, req.user.id]
            );
            if (!connResult.rows.length) {
                return res.status(404).json({ error: `Connection ${source.connectionId} not found` });
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
                const sql = `SELECT ${cols} FROM ${source.table} LIMIT 1000`;
                const result = await adapter.query(sql);
                datasets.push({ columns: result.columns, data: result.data, table: source.table });
            } catch (err) {
                cleanup();
                return res.status(400).json({ error: `Error querying ${source.table}: ${err.message}` });
            }
            cleanup();
        }

        // If no join specified, return first dataset
        if (!join || datasets.length < 2) {
            const d = datasets[0];
            const masked = applyMasking({ columns: d.columns, data: d.data }, req.user.role);
            return res.json({ ...masked, duration: 0, rowCount: d.data.length });
        }

        // Perform in-memory join
        const left = datasets[join.leftIdx || 0];
        const right = datasets[join.rightIdx || 1];
        const joinType = (join.type || 'INNER').toUpperCase();

        const joinedData = [];
        const joinedColumns = [
            ...left.columns.map(c => left.table + '.' + c),
            ...right.columns.map(c => right.table + '.' + c)
        ];

        for (const lRow of left.data) {
            const lVal = lRow[join.leftCol];
            const matches = right.data.filter(rRow => rRow[join.rightCol] == lVal);

            if (matches.length) {
                for (const rRow of matches) {
                    const merged = {};
                    left.columns.forEach(c => { merged[left.table + '.' + c] = lRow[c]; });
                    right.columns.forEach(c => { merged[right.table + '.' + c] = rRow[c]; });
                    joinedData.push(merged);
                }
            } else if (joinType === 'LEFT' || joinType === 'LEFT OUTER') {
                const merged = {};
                left.columns.forEach(c => { merged[left.table + '.' + c] = lRow[c]; });
                right.columns.forEach(c => { merged[right.table + '.' + c] = null; });
                joinedData.push(merged);
            }
        }

        const masked = applyMasking({ columns: joinedColumns, data: joinedData }, req.user.role);
        res.json({ ...masked, duration: 0, rowCount: joinedData.length });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
