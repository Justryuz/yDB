/**
 * @file middleware/auth.js
 * @description JWT authentication middleware.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/pool');

/** Extract a bearer token from the Authorization header or ?token query param. */
function extractToken(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice(7);
    if (req.query && req.query.token) return req.query.token;
    return null;
}

/**
 * Confirm the token still matches the account's current state:
 *  - the account exists and is active
 *  - the token's version claim matches users.token_version
 * Bumping token_version (on disable or password change) revokes all
 * previously issued tokens immediately.
 * @returns {Promise<{ok: true} | {ok: false, status: number, error: string}>}
 */
async function verifyAccountState(payload) {
    try {
        const result = await db.query(
            'SELECT active, token_version FROM users WHERE id = $1',
            [payload.id]
        );
        if (!result.rows.length) {
            return { ok: false, status: 401, error: 'Account not found' };
        }
        const row = result.rows[0];
        if (!row.active) {
            return { ok: false, status: 403, error: 'Account is disabled' };
        }
        // Only enforce version when the token carries one (legacy tokens have none).
        if (payload.tv !== undefined && payload.tv !== row.token_version) {
            return { ok: false, status: 401, error: 'Token has been revoked. Please log in again.' };
        }
        return { ok: true };
    } catch (err) {
        // Fail closed on unexpected errors during a security check.
        return { ok: false, status: 500, error: 'Authentication check failed' };
    }
}

/**
 * Verify JWT token from Authorization header.
 * Attaches user payload to req.user.
 */
async function authenticate(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    let payload;
    try {
        payload = jwt.verify(token, config.jwt.secret);
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Scoped tokens (e.g. the limited "password_change" token issued when a
    // forced password change is pending) must NOT grant access to general
    // protected endpoints. Reject any scoped token here; routes that
    // deliberately accept a scope use authenticateScope() instead.
    if (payload.scope) {
        return res.status(403).json({ error: 'This token is not valid for this action' });
    }

    const state = await verifyAccountState(payload);
    if (!state.ok) {
        return res.status(state.status).json({ error: state.error });
    }

    req.user = payload;
    next();
}

/**
 * Authenticate a token that carries a specific scope claim.
 * Used for limited-purpose tokens (e.g. the forced password-change flow),
 * so a scoped token is accepted only on the route it was minted for.
 * @param {string} requiredScope - The scope the token must carry.
 */
function authenticateScope(requiredScope) {
    return async (req, res, next) => {
        const token = extractToken(req);
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        let payload;
        try {
            payload = jwt.verify(token, config.jwt.secret);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Accept either a full token (no scope) or a token with the exact scope.
        if (payload.scope && payload.scope !== requiredScope) {
            return res.status(403).json({ error: 'This token is not valid for this action' });
        }

        const state = await verifyAccountState(payload);
        if (!state.ok) {
            return res.status(state.status).json({ error: state.error });
        }

        req.user = payload;
        next();
    };
}

/**
 * Require specific role(s).
 * @param {...string} roles - Allowed roles
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = { authenticate, authenticateScope, authorize };
