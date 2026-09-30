/**
 * @file tests/ai-cache.test.js
 * @description Tests for the LLM response cache (keying, hit/miss, TTL, LRU).
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

const cache = require('../services/ai-cache');

describe('ai-cache', () => {
    beforeEach(() => cache.clear());

    test('returns undefined on miss, value on hit', () => {
        const id = { provider: 'openai', model: 'gpt-4o-mini', prompt: 'hello' };
        expect(cache.get(id)).toBeUndefined();
        cache.set(id, 'world');
        expect(cache.get(id)).toBe('world');
    });

    test('different prompts produce different keys', () => {
        cache.set({ provider: 'openai', model: 'm', prompt: 'a' }, 'A');
        cache.set({ provider: 'openai', model: 'm', prompt: 'b' }, 'B');
        expect(cache.get({ provider: 'openai', model: 'm', prompt: 'a' })).toBe('A');
        expect(cache.get({ provider: 'openai', model: 'm', prompt: 'b' })).toBe('B');
    });

    test('different provider/model do not collide on same prompt', () => {
        cache.set({ provider: 'openai', model: 'm', prompt: 'x' }, 'openai-val');
        cache.set({ provider: 'gemini', model: 'm', prompt: 'x' }, 'gemini-val');
        expect(cache.get({ provider: 'openai', model: 'm', prompt: 'x' })).toBe('openai-val');
        expect(cache.get({ provider: 'gemini', model: 'm', prompt: 'x' })).toBe('gemini-val');
    });

    test('respects TTL expiry', () => {
        const id = { provider: 'p', model: 'm', prompt: 'ttl' };
        cache.set(id, 'v', 5); // 5ms TTL
        const before = cache.get(id);
        expect(before).toBe('v');
        // Simulate expiry by waiting past TTL.
        return new Promise((resolve) => setTimeout(() => {
            expect(cache.get(id)).toBeUndefined();
            resolve();
        }, 15));
    });

    test('tracks hit/miss stats', () => {
        const id = { provider: 'p', model: 'm', prompt: 'stats' };
        cache.get(id);          // miss
        cache.set(id, 'v');
        cache.get(id);          // hit
        const s = cache.stats();
        expect(s.hits).toBeGreaterThanOrEqual(1);
        expect(s.misses).toBeGreaterThanOrEqual(1);
    });
});
