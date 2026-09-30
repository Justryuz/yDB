/**
 * @file tests/auth.test.js
 * @description Tests for auth middleware, password policy, and secrets hardening.
 */

// Set env before any imports
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');

// Mock the db module before requiring auth
jest.mock('../db/pool', () => ({
    query: jest.fn(),
    pool: { connect: jest.fn(), end: jest.fn() }
}));

const { authenticate, authenticateScope, authorize } = require('../middleware/auth');
const { validatePassword } = require('../middleware/password-policy');
const config = require('../config');
const db = require('../db/pool');

/** Make db.query resolve to an active user with the given token_version. */
function mockActiveUser(tokenVersion = 0, active = true) {
    db.query.mockResolvedValue({ rows: [{ active, token_version: tokenVersion }] });
}

describe('Authentication Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = { headers: {}, query: {}, socket: { remoteAddress: '127.0.0.1' } };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
        db.query.mockReset();
        mockActiveUser(0);
    });

    test('returns 401 when no token provided', async () => {
        await authenticate(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 for invalid token', async () => {
        req.headers.authorization = 'Bearer invalid-token';
        await authenticate(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('accepts valid Bearer token', async () => {
        const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', tv: 0 }, config.jwt.secret);
        req.headers.authorization = `Bearer ${token}`;
        await authenticate(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.user.id).toBe(1);
        expect(req.user.role).toBe('admin');
    });

    test('accepts token from query param (SSE support)', async () => {
        const token = jwt.sign({ id: 2, username: 'user', role: 'viewer', tv: 0 }, config.jwt.secret);
        req.query.token = token;
        await authenticate(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.user.id).toBe(2);
    });

    test('returns 401 for expired token', async () => {
        const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, config.jwt.secret, { expiresIn: '0s' });
        req.headers.authorization = `Bearer ${token}`;
        await authenticate(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('rejects scoped (limited) token on general endpoints', async () => {
        const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', scope: 'password_change' }, config.jwt.secret);
        req.headers.authorization = `Bearer ${token}`;
        await authenticate(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects a token for a disabled account', async () => {
        mockActiveUser(0, false);
        const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', tv: 0 }, config.jwt.secret);
        req.headers.authorization = `Bearer ${token}`;
        await authenticate(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects a token whose version is stale (revoked)', async () => {
        mockActiveUser(3); // current version is 3
        const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', tv: 2 }, config.jwt.secret);
        req.headers.authorization = `Bearer ${token}`;
        await authenticate(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects a token whose account no longer exists', async () => {
        db.query.mockResolvedValue({ rows: [] });
        const token = jwt.sign({ id: 99, username: 'ghost', role: 'admin', tv: 0 }, config.jwt.secret);
        req.headers.authorization = `Bearer ${token}`;
        await authenticate(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('Scoped Authentication Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = { headers: {}, query: {}, socket: { remoteAddress: '127.0.0.1' } };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        next = jest.fn();
        db.query.mockReset();
        mockActiveUser(0);
    });

    test('accepts a token carrying the required scope', async () => {
        const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', tv: 0, scope: 'password_change' }, config.jwt.secret);
        req.headers.authorization = `Bearer ${token}`;
        await authenticateScope('password_change')(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.user.id).toBe(1);
    });

    test('accepts a full (unscoped) token', async () => {
        const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', tv: 0 }, config.jwt.secret);
        req.headers.authorization = `Bearer ${token}`;
        await authenticateScope('password_change')(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('rejects a token with a different scope', async () => {
        const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', scope: 'something_else' }, config.jwt.secret);
        req.headers.authorization = `Bearer ${token}`;
        await authenticateScope('password_change')(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when no token provided', async () => {
        await authenticateScope('password_change')(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

describe('Authorization Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = { user: { id: 1, username: 'test', role: 'viewer' } };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        next = jest.fn();
    });

    test('allows matching role', () => {
        authorize('viewer')(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('allows one of multiple roles', () => {
        req.user.role = 'editor';
        authorize('admin', 'editor')(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('rejects non-matching role', () => {
        authorize('admin')(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects when no user on request', () => {
        req.user = null;
        authorize('admin')(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe('Password Policy', () => {
    test('rejects short passwords', () => {
        const result = validatePassword('Ab1!');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('at least'))).toBe(true);
    });

    test('requires uppercase', () => {
        const result = validatePassword('lowercase1234!@#');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('uppercase'))).toBe(true);
    });

    test('requires lowercase', () => {
        const result = validatePassword('UPPERCASE1234!@#');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
    });

    test('requires numbers', () => {
        const result = validatePassword('NoNumbers!@#abc');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('number'))).toBe(true);
    });

    test('requires special characters', () => {
        const result = validatePassword('NoSpecial1234Ab');
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('special'))).toBe(true);
    });

    test('accepts valid password meeting all criteria', () => {
        const result = validatePassword('SecureP@ss1234!');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
});

describe('Config — Secrets Hardening', () => {
    test('JWT_SECRET is set from environment (no hardcoded fallback)', () => {
        expect(config.jwt.secret).toBe(process.env.JWT_SECRET);
        expect(config.jwt.secret).not.toContain('dev-secret');
        expect(config.jwt.secret).not.toContain('change-in-production');
    });

    test('ENCRYPTION_KEY is set from environment (no hardcoded fallback)', () => {
        expect(config.encryptionKey).toBe(process.env.ENCRYPTION_KEY);
        expect(config.encryptionKey).not.toContain('default-key');
    });

    test('password policy config is present', () => {
        expect(config.passwordPolicy).toBeDefined();
        expect(config.passwordPolicy.minLength).toBeGreaterThanOrEqual(8);
    });

    test('rate limit config is present', () => {
        expect(config.rateLimits).toBeDefined();
        expect(config.rateLimits.auth.max).toBeLessThan(config.rateLimits.general.max);
    });
});
