/**
 * @file db/init.js
 * @description Initialize the yDB app database schema.
 * Run: node db/init.js
 *
 * Includes:
 *  - Application tables (users, connections, saved_queries, schedules)
 *  - Immutable audit_log table with INSERT-only access for the runtime role
 *  - Indexes for performance
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
    force_password_change BOOLEAN DEFAULT false,
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

-- Immutable audit log — the runtime role only has INSERT privilege.
-- Schema: comprehensive event tracking for all security-relevant actions.
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(200),
    connection_id INTEGER,
    query_text TEXT,
    ip_address INET,
    result_status VARCHAR(30) DEFAULT 'success',
    details JSONB DEFAULT '{}',
    duration_ms INTEGER,
    rows_affected INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
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

-- Active query executions (for cancellation support)
CREATE TABLE IF NOT EXISTS query_executions (
    id UUID PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
    sql_text TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error', 'cancelled')),
    backend_pid INTEGER,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Setup status (tracks first-run completion)
CREATE TABLE IF NOT EXISTS app_setup (
    id SERIAL PRIMARY KEY,
    setup_complete BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    completed_by INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_user ON saved_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(active, last_run);
CREATE INDEX IF NOT EXISTS idx_query_executions_user ON query_executions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_query_executions_status ON query_executions(status) WHERE status = 'running';
`;

/**
 * SQL to restrict audit_log to INSERT-only for the runtime DB role.
 * This requires the app to connect with a non-superuser role.
 * Run as the database owner/superuser during setup.
 */
const auditImmutability = `
-- Revoke all on audit_log from the app runtime role, then grant only INSERT + SELECT.
-- This prevents the app from ever running UPDATE or DELETE on audit_log.
DO $$
BEGIN
    -- Only apply if the role exists (handles fresh installs)
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user) THEN
        EXECUTE format('REVOKE UPDATE, DELETE ON audit_log FROM %I', current_user);
        EXECUTE format('GRANT SELECT, INSERT ON audit_log TO %I', current_user);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO %I', current_user);
    END IF;
END
$$;

-- Additional protection: create a rule that silently prevents DELETE/UPDATE
-- even if privilege revocation isn't possible (e.g., user is table owner).
CREATE OR REPLACE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
`;

async function init() {
    try {
        console.log('[DB] Initializing schema...');
        await pool.query(schema);
        console.log('[DB] Schema created successfully.');

        // Apply audit log immutability rules
        console.log('[DB] Applying audit log immutability rules...');
        await pool.query(auditImmutability);
        console.log('[DB] Audit log protected (INSERT-only + no-op rules on UPDATE/DELETE).');

        // Insert initial setup record if not exists
        await pool.query(`
            INSERT INTO app_setup (id, setup_complete)
            VALUES (1, false)
            ON CONFLICT (id) DO NOTHING
        `);

        console.log('[DB] Init complete.');
    } catch (err) {
        console.error('[DB] Init failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

init();
