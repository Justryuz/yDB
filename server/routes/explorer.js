/**
 * @file routes/explorer.js
 * @description Browse database schemas, tables, columns from real connections.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db/pool');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { getClient } = require('../services/db-clients');

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
 * GET /api/explorer/:connectionId/schema
 * Returns full schema (tables + columns) for a connection.
 */
router.get('/:connectionId/schema', async (req, res) => {
    try {
        const connResult = await db.query(
            'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
            [req.params.connectionId, req.user.id]
        );
        if (!connResult.rows.length) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const conn = connResult.rows[0];
        let password = '';
        try {
            password = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
        } catch (decryptErr) {
            return res.status(500).json({ error: 'Failed to decrypt connection credentials. The encryption key may have changed. Please re-enter the password for this connection.' });
        }

        const client = getClient(conn.db_type);

        const schema = await client.getSchemas({
            host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name,
            endpoints: (conn.options || {}).endpoints || [],
            options: conn.options || {}
        });

        res.json({
            name: conn.database_name,
            type: conn.db_type,
            ...schema
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/explorer/:connectionId/tables/:tableName/data
 * Returns paginated data from a table.
 */
router.get('/:connectionId/tables/:tableName/data', async (req, res) => {
    try {
        const { connectionId, tableName } = req.params;
        const page = parseInt(req.query.page) || 1;
        const perPage = Math.min(parseInt(req.query.perPage) || 25, 1000);
        const offset = (page - 1) * perPage;

        const connResult = await db.query(
            'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
            [connectionId, req.user.id]
        );
        if (!connResult.rows.length) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const conn = connResult.rows[0];
        let password = '';
        try {
            password = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
        } catch (decryptErr) {
            return res.status(500).json({ error: 'Failed to decrypt credentials. Please re-enter the password for this connection.' });
        }

        const client = getClient(conn.db_type);

        const connOpts = {
            host: conn.host, port: conn.port, user: conn.username, password,
            database: conn.database_name,
            endpoints: ((conn.options || {}).endpoints || []), options: conn.options || {}
        };

        // Validate tableName against the real schema to prevent SQL injection.
        // Only names that actually exist as tables are allowed through.
        const schema = await client.getSchemas(connOpts);
        const knownTables = Object.keys((schema && schema.tables) || {});
        if (!knownTables.includes(tableName)) {
            return res.status(400).json({ error: 'Unknown or invalid table name' });
        }

        // Quote the (now whitelisted) identifier per DB dialect as defense in depth.
        const isMySQL = conn.db_type === 'mysql' || conn.db_type === 'mariadb';
        const quoted = isMySQL
            ? '`' + tableName.replace(/`/g, '``') + '`'
            : '"' + tableName.replace(/"/g, '""') + '"';

        const sql = `SELECT * FROM ${quoted} LIMIT ${perPage} OFFSET ${offset}`;
        const result = await client.execute(
            { host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name, endpoints: ((conn.options || {}).endpoints || []), options: conn.options || {} },
            sql
        );

        res.json({
            columns: result.columns,
            data: result.data,
            page,
            perPage,
            rowCount: result.rowCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
