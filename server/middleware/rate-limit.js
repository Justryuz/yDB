/**
 * @file middleware/rate-limit.js
 * @description Per-user rate limiting middleware.
 * Keys on user ID (authenticated) or IP (unauthenticated).
 * Different limits for auth, query, and general API endpoints.
 * Role-based overrides: admin > editor > viewer.
 */

const config = require('../config');

/**
 * In-memory sliding window rate limiter.
 * Keys: `${type}:${identifier}` → array of timestamps
 */
class RateLimiter {
    constructor() {
        /** @type {Map<string, number[]>} */
        this.windows = new Map();
        // Clean up expired entries every 5 minutes
        this.cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    }

    /**
     * Check if a request is allowed.
     * @param {string} key - Unique identifier (userId or IP)
     * @param {string} type - 'auth', 'query', or 'general'
     * @param {string} [role] - User role for override calculation
     * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
     */
    check(key, type, role) {
        const limits = config.rateLimits[type] || config.rateLimits.general;
        const maxRequests = this._getMaxForRole(limits.max, role);
        const windowMs = limits.windowMs;

        const bucketKey = `${type}:${key}`;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Get or create window
        let timestamps = this.windows.get(bucketKey) || [];
        // Remove expired entries
        timestamps = timestamps.filter(t => t > windowStart);

        if (timestamps.length >= maxRequests) {
            // Rate limited
            const oldestInWindow = timestamps[0];
            const resetMs = oldestInWindow + windowMs - now;
            this.windows.set(bucketKey, timestamps);
            return { allowed: false, remaining: 0, resetMs: Math.ceil(resetMs / 1000) };
        }

        // Allow and record
        timestamps.push(now);
        this.windows.set(bucketKey, timestamps);
        return { allowed: true, remaining: maxRequests - timestamps.length, resetMs: 0 };
    }

    /**
     * Role-based multiplier for rate limits.
     * admin: 3x, editor: 2x, viewer: 1x
     */
    _getMaxForRole(baseMax, role) {
        switch (role) {
            case 'admin': return baseMax * 3;
            case 'editor': return baseMax * 2;
            default: return baseMax;
        }
    }

    /** @private Periodic cleanup of expired windows */
    _cleanup() {
        const now = Date.now();
        const maxWindow = 15 * 60 * 1000; // Longest window
        for (const [key, timestamps] of this.windows) {
            const filtered = timestamps.filter(t => t > now - maxWindow);
            if (filtered.length === 0) {
                this.windows.delete(key);
            } else {
                this.windows.set(key, filtered);
            }
        }
    }

    destroy() {
        clearInterval(this.cleanupInterval);
    }
}

// Singleton instance
const limiter = new RateLimiter();

/**
 * Create rate limit middleware for a specific endpoint type.
 * @param {'auth'|'query'|'general'} type
 */
function createRateLimiter(type) {
    return (req, res, next) => {
        // Key on user ID if authenticated, otherwise IP
        const key = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
        const role = req.user?.role || 'viewer';

        const result = limiter.check(key, type, role);

        // Set rate limit headers
        const limits = config.rateLimits[type] || config.rateLimits.general;
        const maxForRole = limiter._getMaxForRole(limits.max, role);
        res.setHeader('X-RateLimit-Limit', maxForRole);
        res.setHeader('X-RateLimit-Remaining', result.remaining);

        if (!result.allowed) {
            res.setHeader('Retry-After', result.resetMs);
            res.setHeader('X-RateLimit-Reset', result.resetMs);
            return res.status(429).json({
                error: 'Too many requests. Please try again later.',
                retryAfter: result.resetMs,
                type
            });
        }

        next();
    };
}

module.exports = { createRateLimiter, limiter };
