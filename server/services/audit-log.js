/**
 * @file services/audit-log.js
 * @description Immutable audit log service.
 * All writes go through this module. No UPDATE or DELETE operations exist.
 * The underlying table is further protected by PostgreSQL rules (no-op on UPDATE/DELETE)
 * and revoked privileges at the database level.
 *
 * Logged events:
 *  - auth.login_success / auth.login_failed / auth.login_disabled
 *  - auth.register / auth.password_changed
 *  - connection.created / connection.updated / connection.deleted
 *  - query.executed / query.error / query.cancelled
 *  - query.federated
 *  - user.created / user.updated / user.deleted
 *  - user.role_changed
 *  - masking.field_accessed
 *  - backup.created / backup.restored
 *  - system.setup_completed
 */

const db = require('../db/pool');

/**
 * Write an audit log entry. INSERT-only — never updates or deletes.
 *
 * @param {Object} entry
 * @param {number|null} entry.userId - Acting user ID
 * @param {string} entry.action - Dotted action identifier (e.g., 'query.executed')
 * @param {string} [entry.resource] - Resource type or name
 * @param {number|null} [entry.connectionId] - Related connection ID
 * @param {string|null} [entry.queryText] - SQL text (if applicable)
 * @param {string|null} [entry.ipAddress] - Client IP
 * @param {string} [entry.status='success'] - 'success', 'failure', 'cancelled'
 * @param {Object} [entry.details={}] - Additional metadata (JSONB)
 * @param {number|null} [entry.durationMs] - Execution duration
 * @param {number|null} [entry.rowsAffected] - Rows returned/affected
 * @param {string|null} [entry.errorMessage] - Error message if failed
 */
async function writeAuditLog(entry) {
    try {
        await db.query(
            `INSERT INTO audit_log
             (user_id, action, resource, connection_id, query_text, ip_address, result_status, details, duration_ms, rows_affected, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                entry.userId || null,
                entry.action,
                entry.resource || null,
                entry.connectionId || null,
                entry.queryText || null,
                entry.ipAddress || null,
                entry.status || 'success',
                JSON.stringify(entry.details || {}),
                entry.durationMs || null,
                entry.rowsAffected || null,
                entry.errorMessage || null
            ]
        );
    } catch (err) {
        // Audit log write failures should not crash the app, but must be visible
        console.error('[AUDIT] Write failed:', err.message);
    }
}

/**
 * Extract client IP from Express request.
 */
function getClientIp(req) {
    if (!req) return null;
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.socket?.remoteAddress ||
           null;
}

/**
 * Convenience: log from an Express request context.
 */
async function logFromRequest(req, action, resource, opts = {}) {
    await writeAuditLog({
        userId: req.user?.id || opts.userId || null,
        action,
        resource,
        connectionId: opts.connectionId || null,
        queryText: opts.queryText || null,
        ipAddress: getClientIp(req),
        status: opts.status || 'success',
        details: opts.details || {},
        durationMs: opts.durationMs || null,
        rowsAffected: opts.rowsAffected || null,
        errorMessage: opts.errorMessage || null
    });
}

module.exports = { writeAuditLog, logFromRequest, getClientIp };
