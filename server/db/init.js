/**
 * @file db/init.js
 * @description Initialize the yDB app database schema.
 * Run: node db/init.js
 */

const { pool } = require('./pool');

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Saved database connections
CREATE TABLE IF NOT EXISTS connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    db_type VARCHAR(30) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER,
    username VARCHAR(100),
    password_encrypted TEXT,
    database_name VARCHAR(100),
    options JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Saved queries / snippets
CREATE TABLE IF NOT EXISTS saved_queries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    folder VARCHAR(100) DEFAULT 'General',
    sql_text TEXT NOT NULL,
    connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Query history / audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
    sql_text TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'success',
    duration_ms INTEGER,
    rows_affected INTEGER,
    error_message TEXT,
    executed_at TIMESTAMP DEFAULT NOW()
);

-- Scheduled queries
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    sql_text TEXT NOT NULL,
    connection_id INTEGER REFERENCES connections(id) ON DELETE CASCADE,
    interval_minutes INTEGER NOT NULL,
    active BOOLEAN DEFAULT true,
    last_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_user ON saved_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_executed ON audit_log(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(active, last_run);
`;

async function init() {
    try {
        console.log('[DB] Initializing schema...');
        await pool.query(schema);
        console.log('[DB] Schema created successfully.');
    } catch (err) {
        console.error('[DB] Init failed:', err.message);
    } finally {
        await pool.end();
    }
}

init();
