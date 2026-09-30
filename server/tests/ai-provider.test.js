/**
 * @file tests/ai-provider.test.js
 * @description Tests for the central AI provider: settings resolution,
 * isEnabled gating, and JSON parsing. Network calls are not exercised.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
// Force a clean AI env so tests exercise the DB-settings path, not a leaked .env.
// dotenv (loaded by config.js) will not override keys that are already set,
// so setting them here to empty neutralises any .env values.
process.env.NLQ_PROVIDER = '';
process.env.NLQ_MODEL = '';
process.env.NLQ_API_KEY = '';
process.env.AWS_BEARER_TOKEN_BEDROCK = '';

// Mock the settings store so we control DB-backed settings.
jest.mock('../services/settings-store', () => ({
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn()
}));

const settingsStore = require('../services/settings-store');
const aiProvider = require('../services/ai-provider');

describe('ai-provider getSettings / isEnabled', () => {
    beforeEach(() => settingsStore.get.mockReset());

    test('defaults to builtin when nothing configured', async () => {
        settingsStore.get.mockResolvedValue(null);
        const s = await aiProvider.getSettings();
        expect(s.provider).toBe('builtin');
        expect(await aiProvider.isEnabled()).toBe(false);
    });

    test('DB settings override env; picks a per-provider default model', async () => {
        settingsStore.get.mockResolvedValue({ provider: 'anthropic', apiKey: 'sk-test' });
        const s = await aiProvider.getSettings();
        expect(s.provider).toBe('anthropic');
        expect(s.model).toBe(aiProvider.DEFAULT_MODEL.anthropic);
        expect(await aiProvider.isEnabled()).toBe(true);
    });

    test('openai without an API key is not enabled', async () => {
        settingsStore.get.mockResolvedValue({ provider: 'openai' });
        expect(await aiProvider.isEnabled()).toBe(false);
    });

    test('bedrock is enabled without an explicit key (IAM creds)', async () => {
        settingsStore.get.mockResolvedValue({ provider: 'bedrock' });
        expect(await aiProvider.isEnabled()).toBe(true);
    });

    test('explicit model is respected', async () => {
        settingsStore.get.mockResolvedValue({ provider: 'gemini', apiKey: 'k', model: 'gemini-2.5-pro' });
        const s = await aiProvider.getSettings();
        expect(s.model).toBe('gemini-2.5-pro');
    });
});

describe('ai-provider parseJSON', () => {
    test('parses plain JSON', () => {
        expect(aiProvider.parseJSON('{"sql":"SELECT 1"}')).toEqual({ sql: 'SELECT 1' });
    });

    test('strips ```json fences', () => {
        const out = aiProvider.parseJSON('```json\n{"a":1}\n```');
        expect(out).toEqual({ a: 1 });
    });

    test('extracts a JSON object embedded in prose', () => {
        const out = aiProvider.parseJSON('Here you go: {"x": 2} — hope that helps');
        expect(out).toEqual({ x: 2 });
    });

    test('returns _raw when no JSON present', () => {
        const out = aiProvider.parseJSON('no json here');
        expect(out._raw).toBe('no json here');
    });
});
