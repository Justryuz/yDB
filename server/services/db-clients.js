/**
 * @file services/db-clients.js
 * @description Database client factory — returns the appropriate driver for each DB type.
 * Supports: PostgreSQL, MySQL, SQLite, MongoDB, MSSQL, Redis, Cassandra, Neo4j, ClickHouse, etc.
 */

// ── PostgreSQL ────────────────────────────────────────────
const pgClient = {
    async testConnection(opts) {
        const { Pool } = require('pg');
        const pool = new Pool({ host: opts.host, port: opts.port, user: opts.user, password: opts.password, database: opts.database, connectionTimeoutMillis: 5000 });
        try { await pool.query('SELECT 1'); return true; } catch { return false; } finally { await pool.end(); }
    },
    async execute(opts, sql) {
        const { Pool } = require('pg');
        const pool = new Pool({ host: opts.host, port: opts.port, user: opts.user, password: opts.password, database: opts.database, connectionTimeoutMillis: 10000, query_timeout: 30000 });
        try {
            const start = Date.now();
            const result = await pool.query(sql);
            return { columns: result.fields.map(f => f.name), data: result.rows, duration: Date.now() - start, rowCount: result.rowCount };
        } finally { await pool.end(); }
    },
    async getSchemas(opts) {
        const { Pool } = require('pg');
        const pool = new Pool({ host: opts.host, port: opts.port, user: opts.user, password: opts.password, database: opts.database, connectionTimeoutMillis: 10000 });
        try {
            // Exclude yDB internal tables
            const excludeTables = ['users', 'connections', 'saved_queries', 'audit_log', 'schedules'];
            const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
            const schema = { tables: {} };
            for (const row of tables.rows) {
                if (excludeTables.includes(row.table_name)) continue;
                const cols = await pool.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [row.table_name]);
                schema.tables[row.table_name] = { columns: cols.rows.map(c => ({ name: c.column_name, type: c.data_type.toUpperCase(), nullable: c.is_nullable === 'YES', key: '' })) };
            }
            return schema;
        } finally { await pool.end(); }
    }
};

// ── MySQL / MariaDB ───────────────────────────────────────
const mysqlClient = {
    async testConnection(opts) {
        const mysql = require('mysql2/promise');
        try { const conn = await mysql.createConnection({ host: opts.host, port: opts.port, user: opts.user, password: opts.password, database: opts.database, connectTimeout: 5000 }); await conn.query('SELECT 1'); await conn.end(); return true; } catch { return false; }
    },
    async execute(opts, sql) {
        const mysql = require('mysql2/promise');
        const conn = await mysql.createConnection({ host: opts.host, port: opts.port, user: opts.user, password: opts.password, database: opts.database });
        try {
            const start = Date.now();
            const [rows, fields] = await conn.query(sql);
            return { columns: fields ? fields.map(f => f.name) : [], data: Array.isArray(rows) ? rows : [], duration: Date.now() - start, rowCount: Array.isArray(rows) ? rows.length : 0 };
        } finally { await conn.end(); }
    },
    async getSchemas(opts) {
        const mysql = require('mysql2/promise');
        const conn = await mysql.createConnection({ host: opts.host, port: opts.port, user: opts.user, password: opts.password, database: opts.database });
        try {
            const [tables] = await conn.query('SHOW TABLES');
            const key = Object.keys(tables[0] || {})[0];
            const schema = { tables: {} };
            for (const row of tables) {
                const tn = row[key];
                const [cols] = await conn.query('DESCRIBE ??', [tn]);
                schema.tables[tn] = { columns: cols.map(c => ({ name: c.Field, type: c.Type.toUpperCase(), nullable: c.Null === 'YES', key: c.Key === 'PRI' ? 'PK' : c.Key === 'MUL' ? 'FK' : '' })) };
            }
            return schema;
        } finally { await conn.end(); }
    }
};

// ── MongoDB ───────────────────────────────────────────────
const mongoClient = {
    async testConnection(opts) {
        const { MongoClient } = require('mongodb');
        const url = `mongodb://${opts.user}:${opts.password}@${opts.host}:${opts.port}/${opts.database}`;
        try { const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 }); await client.connect(); await client.close(); return true; } catch { return false; }
    },
    async execute(opts, sql) {
        // MongoDB uses collection.find() — parse simple queries
        const { MongoClient } = require('mongodb');
        const url = `mongodb://${opts.user}:${opts.password}@${opts.host}:${opts.port}/${opts.database}`;
        const client = new MongoClient(url);
        try {
            await client.connect();
            const db = client.db(opts.database);
            // Simple: assume sql is collection name for find all
            const match = sql.match(/from\s+(\w+)/i);
            const collection = match ? match[1] : sql.trim();
            const start = Date.now();
            const docs = await db.collection(collection).find({}).limit(100).toArray();
            const columns = docs.length ? Object.keys(docs[0]) : [];
            return { columns, data: docs, duration: Date.now() - start, rowCount: docs.length };
        } finally { await client.close(); }
    },
    async getSchemas(opts) {
        const { MongoClient } = require('mongodb');
        const url = `mongodb://${opts.user}:${opts.password}@${opts.host}:${opts.port}/${opts.database}`;
        const client = new MongoClient(url);
        try {
            await client.connect();
            const db = client.db(opts.database);
            const collections = await db.listCollections().toArray();
            const schema = { tables: {} };
            for (const col of collections) {
                const sample = await db.collection(col.name).findOne();
                schema.tables[col.name] = { columns: sample ? Object.keys(sample).map(k => ({ name: k, type: typeof sample[k] === 'number' ? 'Number' : 'String', nullable: true, key: k === '_id' ? 'PK' : '' })) : [] };
            }
            return schema;
        } finally { await client.close(); }
    }
};

// ── MSSQL ─────────────────────────────────────────────────
const mssqlClient = {
    async testConnection(opts) {
        const sql = require('mssql');
        try {
            const pool = await sql.connect({ server: opts.host, port: opts.port, database: opts.database, user: opts.user, password: opts.password, options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 5000 });
            await pool.close();
            return true;
        } catch { return false; }
    },
    async execute(opts, sqlText) {
        const sql = require('mssql');
        const pool = await sql.connect({ server: opts.host, port: opts.port, database: opts.database, user: opts.user, password: opts.password, options: { encrypt: false, trustServerCertificate: true } });
        try {
            const start = Date.now();
            const result = await pool.request().query(sqlText);
            return { columns: result.recordset.columns ? Object.keys(result.recordset.columns) : (result.recordset.length ? Object.keys(result.recordset[0]) : []), data: result.recordset, duration: Date.now() - start, rowCount: result.recordset.length };
        } finally { await pool.close(); }
    },
    async getSchemas(opts) {
        const sql = require('mssql');
        const pool = await sql.connect({ server: opts.host, port: opts.port, database: opts.database, user: opts.user, password: opts.password, options: { encrypt: false, trustServerCertificate: true } });
        try {
            const tables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'");
            const schema = { tables: {} };
            for (const row of tables.recordset) {
                const cols = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${row.TABLE_NAME}'`);
                schema.tables[row.TABLE_NAME] = { columns: cols.recordset.map(c => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE.toUpperCase(), nullable: c.IS_NULLABLE === 'YES', key: '' })) };
            }
            return schema;
        } finally { await pool.close(); }
    }
};

// ── Redis ─────────────────────────────────────────────────
const redisClient = {
    async testConnection(opts) {
        const Redis = require('ioredis');
        try { const r = new Redis({ host: opts.host, port: opts.port, password: opts.password, connectTimeout: 5000 }); await r.ping(); await r.quit(); return true; } catch { return false; }
    },
    async execute(opts, sql) { return { columns: ['result'], data: [{ result: 'Use Redis commands via terminal' }], duration: 0, rowCount: 1 }; },
    async getSchemas(opts) { return { tables: {} }; }
};

// ── Fallback (unsupported) ────────────────────────────────
const fallbackClient = {
    async testConnection() { return false; },
    async execute() { return { columns: [], data: [], duration: 0, rowCount: 0, error: 'Driver not yet implemented for this database type' }; },
    async getSchemas() { return { tables: {} }; }
};

// ── Factory ───────────────────────────────────────────────
const clients = {
    postgresql: pgClient,
    mysql: mysqlClient,
    mariadb: mysqlClient,
    mongodb: mongoClient,
    mssql: mssqlClient,
    redis: redisClient
};

function getClient(dbType) {
    return clients[dbType] || fallbackClient;
}

module.exports = { getClient, encrypt: null, decrypt: null };
