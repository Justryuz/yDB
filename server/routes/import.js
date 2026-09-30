/**
 * @file routes/import.js
 * @description Import CSV/JSON data into a database table.
 */

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { decrypt } = require('../services/crypto');

router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * POST /api/import/parse
 * Upload a file and parse it to preview data.
 */
router.post('/parse', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const content = req.file.buffer.toString('utf-8');
        let columns = [];
        let data = [];

        if (ext === 'csv') {
            const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
            if (records.length) {
                columns = Object.keys(records[0]);
                data = records;
            }
        } else if (ext === 'json') {
            const parsed = JSON.parse(content);
            data = Array.isArray(parsed) ? parsed : [parsed];
            if (data.length) columns = Object.keys(data[0]);
        } else {
            return res.status(400).json({ error: 'Unsupported format. Use CSV or JSON.' });
        }

        res.json({
            filename: req.file.originalname,
            columns,
            data: data.slice(0, 100), // Preview first 100 rows
            totalRows: data.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/import/execute
 * Import data into a target database connection.
 * Body: { connectionId, tableName, columns, data }
 */
router.post('/execute', async (req, res) => {
    try {
        const { connectionId, tableName, columns, data } = req.body;
        if (!connectionId || !tableName || !columns || !data) {
            return res.status(400).json({ error: 'connectionId, tableName, columns, and data required' });
        }

        const db = require('../db/pool');
        const poolManager = require('../services/pool-manager');
        const { withTunnel } = require('../services/ssh-tunnel');

        // Get connection
        const connResult = await db.query('SELECT * FROM connections WHERE id = $1 AND user_id = $2', [connectionId, req.user.id]);
        if (!connResult.rows.length) return res.status(404).json({ error: 'Connection not found' });

        const conn = connResult.rows[0];
        let password = '';
        try {
            password = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
        } catch (e) { return res.status(500).json({ error: 'Failed to decrypt credentials' }); }

        const options = conn.options || {};
        const { opts, cleanup } = await withTunnel(
            { host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name, endpoints: (options.endpoints || []), options },
            options.ssh
        );

        try {
            const adapter = await poolManager.getAdapter(connectionId, conn.db_type, opts);
            const isMySQL = conn.db_type === 'mysql' || conn.db_type === 'mariadb';
            const q = isMySQL ? '`' : '"'; // Quote character

            // Validate the table name: allow only a safe identifier pattern so it
            // cannot break out of the quoting and inject SQL.
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
                cleanup();
                return res.status(400).json({ error: 'Invalid table name. Use letters, numbers and underscores only, starting with a letter or underscore.' });
            }
            const safeTable = tableName;

            // Sanitize column names
            const safeCols = columns.map(c => c.replace(/[^a-zA-Z0-9_]/g, '_'));

            // Create table
            const colDefs = safeCols.map(c => `${q}${c}${q} TEXT`).join(', ');
            await adapter.query(`CREATE TABLE IF NOT EXISTS ${q}${safeTable}${q} (${colDefs})`);

            // Insert data in batches
            let imported = 0;
            for (const row of data) {
                const vals = columns.map(c => {
                    const v = row[c];
                    if (v === null || v === undefined || v === '') return 'NULL';
                    return `'${String(v).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
                }).join(', ');
                try {
                    await adapter.query(`INSERT INTO ${q}${safeTable}${q} (${safeCols.map(c => q + c + q).join(', ')}) VALUES (${vals})`);
                    imported++;
                } catch (insertErr) {
                    // Skip failed rows, continue
                    console.error('[Import] Row skip:', insertErr.message);
                }
            }

            cleanup();
            res.json({ success: true, rowCount: imported, tableName });
        } catch (err) {
            cleanup();
            res.status(500).json({ error: 'Import failed: ' + err.message });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
