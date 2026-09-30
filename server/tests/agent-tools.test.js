/**
 * @file tests/agent-tools.test.js
 * @description Tests the agent's read-only tool dispatcher.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

jest.mock('../db/pool', () => ({ query: jest.fn(), pool: { connect: jest.fn(), end: jest.fn() } }));

const { createTools } = require('../services/agent-tools');

function makeCtx(overrides = {}) {
    const schema = {
        tables: {
            users: { columns: [{ name: 'id', type: 'INT', key: 'PK' }, { name: 'email', type: 'TEXT' }] },
            orders: { columns: [{ name: 'id', type: 'INT', key: 'PK' }, { name: 'amount', type: 'DECIMAL' }] }
        }
    };
    const adapter = {
        query: jest.fn().mockResolvedValue({ columns: ['id'], data: [{ id: 1 }], rowCount: 1 })
    };
    return { adapter, schema, dbType: 'postgresql', role: 'admin', ...overrides };
}

describe('agent-tools dispatcher', () => {
    test('exposes a tool spec list including final_answer', () => {
        const { specs } = createTools(makeCtx());
        const names = specs.map(s => s.name);
        expect(names).toEqual(expect.arrayContaining(['list_tables', 'describe_table', 'sample_rows', 'explain_query', 'run_query', 'final_answer']));
    });

    test('list_tables returns schema table names', async () => {
        const { dispatch } = createTools(makeCtx());
        const r = await dispatch('list_tables', {});
        expect(r.tables).toEqual(['users', 'orders']);
    });

    test('describe_table returns columns for a known table', async () => {
        const { dispatch } = createTools(makeCtx());
        const r = await dispatch('describe_table', { table: 'users' });
        expect(r.columns.map(c => c.name)).toEqual(['id', 'email']);
    });

    test('describe_table rejects an unknown table', async () => {
        const { dispatch } = createTools(makeCtx());
        const r = await dispatch('describe_table', { table: 'ghost' });
        expect(r.error).toMatch(/unknown table/i);
    });

    test('sample_rows issues a LIMITed SELECT', async () => {
        const ctx = makeCtx();
        const { dispatch } = createTools(ctx);
        await dispatch('sample_rows', { table: 'users' });
        expect(ctx.adapter.query).toHaveBeenCalledWith(expect.stringMatching(/SELECT \* FROM "users" LIMIT 5/));
    });

    test('run_query blocks non-SELECT statements', async () => {
        const ctx = makeCtx();
        const { dispatch } = createTools(ctx);
        const r = await dispatch('run_query', { sql: 'DROP TABLE users' });
        expect(r.error).toBeDefined();
        expect(ctx.adapter.query).not.toHaveBeenCalled();
    });

    test('run_query executes a SELECT and returns rows', async () => {
        const ctx = makeCtx();
        const { dispatch } = createTools(ctx);
        const r = await dispatch('run_query', { sql: 'SELECT id FROM users' });
        expect(r.rows).toEqual([{ id: 1 }]);
        expect(ctx.adapter.query).toHaveBeenCalledWith('SELECT id FROM users');
    });

    test('explain_query blocks non-SELECT and runs EXPLAIN for SELECT', async () => {
        const ctx = makeCtx();
        const { dispatch } = createTools(ctx);
        const blocked = await dispatch('explain_query', { sql: 'DELETE FROM users' });
        expect(blocked.error).toBeDefined();

        await dispatch('explain_query', { sql: 'SELECT * FROM users' });
        expect(ctx.adapter.query).toHaveBeenCalledWith(expect.stringMatching(/^EXPLAIN /));
    });

    test('uses backtick quoting for mysql', async () => {
        const ctx = makeCtx({ dbType: 'mysql' });
        const { dispatch } = createTools(ctx);
        await dispatch('sample_rows', { table: 'orders' });
        expect(ctx.adapter.query).toHaveBeenCalledWith(expect.stringMatching(/FROM `orders`/));
    });

    test('unknown tool returns an error', async () => {
        const { dispatch } = createTools(makeCtx());
        const r = await dispatch('nope', {});
        expect(r.error).toMatch(/unknown tool/i);
    });
});
