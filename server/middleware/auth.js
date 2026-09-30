/**
 * @file middleware/auth.js
 * @description JWT authentication middleware.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Verify JWT token from Authorization header.
 * Attaches user payload to req.user.
 */
function authenticate(req, res, next) {
    // Accept token from Authorization header or query param (for SSE/EventSource)
    let token = null;
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        token = header.slice(7);
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const payload = jwt.verify(token, config.jwt.secret);

        // Scoped tokens (e.g. the limited "password_change" token issued when a
        // forced password change is pending) must NOT grant access to general
        // protected endpoints. Reject any scoped token here; routes that
        // deliberately accept a scope use authenticateScope() instead.
        if (payload.scope) {
            return res.status(403).json({ error: 'This token is not valid for this action' });
        }

        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Authenticate a token that carries a specific scope claim.
 * Used for limited-purpose tokens (e.g. the forced password-change flow),
 * so a scoped token is accepted only on the route it was minted for.
 * @param {string} requiredScope - The scope the token must carry.
 */
function authenticateScope(requiredScope) {
    return (req, res, next) => {
        let token = null;
        const header = req.headers.authorization;
        if (header && header.startsWith('Bearer ')) {
            token = header.slice(7);
        } else if (req.query && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        try {
            const payload = jwt.verify(token, config.jwt.secret);
            // Accept either a full token (no scope) or a token with the exact scope.
            if (payload.scope && payload.scope !== requiredScope) {
                return res.status(403).json({ error: 'This token is not valid for this action' });
            }
            req.user = payload;
            next();
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
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
