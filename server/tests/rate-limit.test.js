/**
 * @file tests/rate-limit.test.js
 * @description Tests for per-user rate limiting.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

jest.mock('../db/pool', () => ({
    query: jest.fn(),
    pool: { connect: jest.fn(), end: jest.fn() }
}));

const { createRateLimiter, limiter } = require('../middleware/rate-limit');

afterAll(() => {
    limiter.destroy();
});

describe('Per-User Rate Limiting', () => {
    beforeEach(() => {
        // Clear all rate limit windows
        limiter.windows.clear();
    });

    test('allows requests within limit', () => {
        const result = limiter.check('user:1', 'general', 'viewer');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeGreaterThan(0);
    });

    test('blocks requests over limit', () => {
        const max = 500; // viewer general limit
        // Fill up the window
        for (let i = 0; i < max; i++) {
            limiter.check('user:99', 'general', 'viewer');
        }
        const result = limiter.check('user:99', 'general', 'viewer');
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.resetMs).toBeGreaterThan(0);
    });

    test('per-user isolation — one user hitting limit does not affect another', () => {
        const max = 500;
        // User A hits the limit
        for (let i = 0; i < max; i++) {
            limiter.check('user:A', 'general', 'viewer');
        }
        const blockedA = limiter.check('user:A', 'general', 'viewer');
        expect(blockedA.allowed).toBe(false);

        // User B is unaffected
        const allowedB = limiter.check('user:B', 'general', 'viewer');
        expect(allowedB.allowed).toBe(true);
    });

    test('admin role gets higher limits (3x multiplier)', () => {
        const baseMax = 500;
        const adminMax = baseMax * 3; // 1500

        // Admin should be able to make more requests
        for (let i = 0; i < baseMax + 1; i++) {
            const result = limiter.check('admin:1', 'general', 'admin');
            if (i === baseMax) {
                // Viewer would be blocked here, admin should still be allowed
                expect(result.allowed).toBe(true);
            }
        }
    });

    test('auth endpoint has stricter limits', () => {
        const authMax = 10; // auth limit for viewer
        for (let i = 0; i < authMax; i++) {
            limiter.check('user:auth-test', 'auth', 'viewer');
        }
        const result = limiter.check('user:auth-test', 'auth', 'viewer');
        expect(result.allowed).toBe(false);
    });

    test('middleware returns 429 with Retry-After header', () => {
        const middleware = createRateLimiter('auth');
        const req = { user: { id: 'ratelimit-test', role: 'viewer' }, ip: '1.2.3.4' };
        const res = {
            setHeader: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        const next = jest.fn();

        // Exhaust limit
        for (let i = 0; i < 10; i++) {
            limiter.check('user:ratelimit-test', 'auth', 'viewer');
        }

        middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
        expect(next).not.toHaveBeenCalled();
    });

    test('middleware uses IP for unauthenticated requests', () => {
        const middleware = createRateLimiter('general');
        const req = { user: null, ip: '192.168.1.1' };
        const res = { setHeader: jest.fn() };
        const next = jest.fn();

        middleware(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});
