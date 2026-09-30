/**
 * @file services/connection-context.js
 * @description Helpers to load a user's saved connection, decrypt its password,
 * open an adapter (through any SSH tunnel), and fetch its schema. Centralises the
 * pattern that was duplicated across many AI endpoints.
 */

const db = require('../db/pool');
const { decrypt } = require('./crypto');
const poolManager = require('./pool-manager');
const { withTunnel } = require('./ssh-tunnel');
const { SchemaCache } = require('./nlq');

/** Fetch a connection row scoped to the user, or null. */
async function getConnection(connectionId, userId) {
    if (!connectionId) return null;
    const r = await db.query('SELECT * FROM connections WHERE id = $1 AND user_id = $2', [connectionId, userId]);
    return r.rows[0] || null;
}

/** Decrypt a connection's password, returning '' on any failure. */
function connPassword(conn) {
    try {
        return conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
    } catch (e) {
        return '';
    }
}

/**
 * Get an open adapter for a connection plus a cleanup() to close the tunnel.
 * Caller MUST invoke cleanup().
 * @returns {Promise<{adapter, cleanup, conn}>}
 */
async function openAdapter(connectionId, userId) {
    const conn = await getConnection(connectionId, userId);
    if (!conn) throw new Error('Connection not found');
    const options = conn.options || {};
    const { opts, cleanup } = await withTunnel(
        { host: conn.host, port: conn.port, user: conn.username, password: connPassword(conn), database: conn.database_name, endpoints: (options.endpoints || []), options },
        options.ssh
    );
    try {
        const adapter = await poolManager.getAdapter(connectionId, conn.db_type, opts);
        return { adapter, cleanup, conn };
    } catch (err) {
        cleanup();
        throw err;
    }
}

/**
 * Get the schema for a connection, using the shared SchemaCache when possible.
 * @returns {Promise<{schema, dbType}>}
 */
async function getSchema(connectionId, userId) {
    if (!connectionId) return { schema: { tables: {} }, dbType: 'mysql' };
    const cached = SchemaCache.get(connectionId);
    const conn = await getConnection(connectionId, userId);
    if (!conn) return { schema: { tables: {} }, dbType: 'mysql' };
    if (cached) return { schema: cached, dbType: conn.db_type };

    const { adapter, cleanup } = await openAdapter(connectionId, userId);
    try {
        const schema = await adapter.getSchema();
        SchemaCache.set(connectionId, schema);
        return { schema, dbType: conn.db_type };
    } finally {
        cleanup();
    }
}

module.exports = { getConnection, connPassword, openAdapter, getSchema };
