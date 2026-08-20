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
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
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

module.exports = { authenticate, authorize };
