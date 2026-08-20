/**
 * @file routes/connections.js
 * @description CRUD for database connections + test connection.
 * All mutations are logged to the audit trail.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/pool');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { getClient } = require('../services/db-clients');
const { logFromRequest } = require('../services/audit-log');

router.use(authenticate);

// ── Encryption helpers ────────────────────────────────────
function encrypt(text) {
    const key = crypto.scryptSync(config.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

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
 * GET /api/connections
 * List all connections for current user.
 */
router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, name, db_type, host, port, username, database_name, options, created_at FROM connections WHERE user_id = $1 ORDER BY name',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/connections
 * Create a new connection.
 */
router.post('/', async (req, res) => {
    try {
        const { name, db_type, host, port, username, password, database_name, options } = req.body;
        const encPassword = password ? encrypt(password) : null;

        const result = await db.query(
            `INSERT INTO connections (user_id, name, db_type, host, port, username, password_encrypted, database_name, options)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, db_type, host, port, username, database_name`,
            [req.user.id, name, db_type, host, port, username, encPassword, database_name, JSON.stringify(options || {})]
        );
        await logFromRequest(req, 'connection.created', 'connections', {
            connectionId: result.rows[0].id,
            details: { name, db_type, host }
        });
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/connections/:id
 * Update a connection.
 */
router.put('/:id', async (req, res) => {
    try {
        const { name, db_type, host, port, username, password, database_name, options } = req.body;
        const encPassword = password ? encrypt(password) : undefined;

        let query, params;
        if (encPassword) {
            query = `UPDATE connections SET name=$1, db_type=$2, host=$3, port=$4, username=$5, password_encrypted=$6, database_name=$7, options=$8, updated_at=NOW()
                     WHERE id=$9 AND user_id=$10 RETURNING id, name, db_type, host, port, username, database_name`;
            params = [name, db_type, host, port, username, encPassword, database_name, JSON.stringify(options || {}), req.params.id, req.user.id];
        } else {
            query = `UPDATE connections SET name=$1, db_type=$2, host=$3, port=$4, username=$5, database_name=$6, options=$7, updated_at=NOW()
                     WHERE id=$8 AND user_id=$9 RETURNING id, name, db_type, host, port, username, database_name`;
            params = [name, db_type, host, port, username, database_name, JSON.stringify(options || {}), req.params.id, req.user.id];
        }

        const result = await db.query(query, params);
        if (!result.rows.length) return res.status(404).json({ error: 'Connection not found' });
        await logFromRequest(req, 'connection.updated', 'connections', {
            connectionId: parseInt(req.params.id),
            details: { name, db_type, host }
        });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/connections/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM connections WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        await logFromRequest(req, 'connection.deleted', 'connections', {
            connectionId: parseInt(req.params.id)
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/connections/test
 * Test connection with provided details (without saving).
 * Body: { db_type, host, port, username, password, database_name }
 */
router.post('/test', async (req, res) => {
    try {
        const { db_type, host, port, username, password, database_name } = req.body;
        if (!db_type || !host) {
            return res.status(400).json({ success: false, message: 'db_type and host required' });
        }

        const client = getClient(db_type);
        const success = await client.testConnection({
            host,
            port: port || 5432,
            user: username || '',
            password: password || '',
            database: database_name || ''
        });

        res.json({ success, message: success ? 'Connection successful' : 'Connection failed' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

/**
 * POST /api/connections/:id/test
 * Test a saved connection by attempting to connect.
 */
router.post('/:id/test', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Connection not found' });

        const conn = result.rows[0];
        const password = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';

        const client = getClient(conn.db_type);
        const success = await client.testConnection({
            host: conn.host,
            port: conn.port,
            user: conn.username,
            password: password,
            database: conn.database_name
        });

        res.json({ success, message: success ? 'Connection successful' : 'Connection failed' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

module.exports = router;
