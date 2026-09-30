/**
 * @file tests/ai-agent.test.js
 * @description Tests the ReAct agent loop: happy path, unsafe-final rejection,
 * guardrail (max steps), and result evaluation.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

jest.mock('../db/pool', () => ({ query: jest.fn(), pool: { connect: jest.fn(), end: jest.fn() } }));

// Mock the provider so we can script the agent's step-by-step decisions.
jest.mock('../services/ai-provider', () => ({
    isEnabled: jest.fn().mockResolvedValue(true),
    completeJSON: jest.fn()
}));

const aiProvider = require('../services/ai-provider');
const aiAgent = require('../services/ai-agent');

function makeAdapter() {
    return {
        query: jest.fn().mockResolvedValue({ columns: ['total'], data: [{ total: 42 }], rowCount: 1 })
    };
}

const schema = { tables: { users: { columns: [{ name: 'id', type: 'INT' }] } } };

function baseParams(overrides = {}) {
    return {
        question: 'how many users?',
        adapter: makeAdapter(),
        schema,
        dbType: 'postgresql',
        role: 'admin',
        ...overrides
    };
}

describe('ai-agent evaluateResult', () => {
    test('flags an errored observation', () => {
        expect(aiAgent.evaluateResult({ error: 'boom' }).ok).toBe(false);
    });
    test('flags an empty result set', () => {
        expect(aiAgent.evaluateResult({ rows: [] }).ok).toBe(false);
    });
    test('flags an all-NULL single row', () => {
        expect(aiAgent.evaluateResult({ rows: [{ a: null, b: null }] }).ok).toBe(false);
    });
    test('accepts a reasonable result', () => {
        expect(aiAgent.evaluateResult({ rows: [{ total: 42 }] }).ok).toBe(true);
    });
});

describe('ai-agent loop', () => {
    beforeEach(() => aiProvider.completeJSON.mockReset());

    test('reaches a final answer and verifies it by executing', async () => {
        // Step 1: inspect. Step 2: final answer.
        aiProvider.completeJSON
            .mockResolvedValueOnce({ thought: 'check tables', tool: 'list_tables', args: {} })
            .mockResolvedValueOnce({ thought: 'answer', tool: 'final_answer', args: { sql: 'SELECT COUNT(*) AS total FROM users', explanation: 'Counts users', chartType: 'number' } });

        const result = await aiAgent.run(baseParams());
        expect(result.success).toBe(true);
        expect(result.sql).toMatch(/SELECT COUNT/i);
        expect(result.provider).toBe('agent');
        expect(result.data).toEqual([{ total: 42 }]);
        // At least one trace step recorded.
        expect(result.steps.length).toBeGreaterThan(0);
    });

    test('rejects an unsafe final answer, then accepts a safe one', async () => {
        aiProvider.completeJSON
            .mockResolvedValueOnce({ thought: 'bad', tool: 'final_answer', args: { sql: 'DROP TABLE users' } })
            .mockResolvedValueOnce({ thought: 'good', tool: 'final_answer', args: { sql: 'SELECT COUNT(*) AS total FROM users', explanation: 'ok', chartType: 'number' } });

        const result = await aiAgent.run(baseParams());
        expect(result.success).toBe(true);
        const rejected = result.steps.some(s => s.type === 'reject');
        expect(rejected).toBe(true);
    });

    test('stops at the step guardrail and falls back to last good query', async () => {
        // Always inspect; never produce a final answer. But run one query so a
        // fallback answer exists.
        aiProvider.completeJSON.mockResolvedValue({ thought: 'loop', tool: 'run_query', args: { sql: 'SELECT COUNT(*) AS total FROM users' } });

        const result = await aiAgent.run(baseParams({ maxSteps: 3 }));
        // Either fell back with a result, or failed gracefully — but must not throw
        // and must cap the steps.
        expect(result.provider).toBe('agent');
        const thoughts = result.steps.filter(s => s.type === 'thought').length;
        expect(thoughts).toBeLessThanOrEqual(3);
        expect(result.success).toBe(true); // fallback to the validated run_query
        expect(result.sql).toMatch(/SELECT COUNT/i);
    });

    test('fails gracefully when the model never runs a valid query', async () => {
        aiProvider.completeJSON.mockResolvedValue({ thought: 'idle', tool: 'list_tables', args: {} });
        const result = await aiAgent.run(baseParams({ maxSteps: 2 }));
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });
});
