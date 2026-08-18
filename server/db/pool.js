/**
 * @file db/pool.js
 * @description PostgreSQL connection pool for the app database.
 */

const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
