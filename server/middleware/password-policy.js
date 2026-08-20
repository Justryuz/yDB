/**
 * @file middleware/password-policy.js
 * @description Server-side password policy enforcement.
 */

const config = require('../config');

/**
 * Validate a password against the configured policy.
 * @param {string} password
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePassword(password) {
    const policy = config.passwordPolicy;
    const errors = [];

    if (!password || password.length < policy.minLength) {
        errors.push(`Password must be at least ${policy.minLength} characters long`);
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (policy.requireNumbers && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    if (policy.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Express middleware that validates req.body.password against policy.
 */
function enforcePasswordPolicy(req, res, next) {
    const { password } = req.body;
    const result = validatePassword(password);
    if (!result.valid) {
        return res.status(400).json({ error: 'Password does not meet policy requirements', details: result.errors });
    }
    next();
}

module.exports = { validatePassword, enforcePasswordPolicy };
