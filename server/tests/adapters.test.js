/**
 * @file tests/adapters.test.js
 * @description Unit tests for DB adapters — mock the drivers, test query/schema/error/cancel paths.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

jest.mock('../db/pool', () => ({
    query: jest.fn(),
    pool: { connect: jest.fn(), end: jest.fn() }
}));

describe('BaseAdapter', () => {
    const BaseAdapter = require('../services/adapters/base');

    test('throws on unimplemented methods', async () => {
        const adapter = new BaseAdapter({ host: 'localhost' });
        await expect(adapter.connect()).rejects.toThrow('not implemented');
        await expect(adapter.query('SELECT 1')).rejects.toThrow('not implemented');
        await expect(adapter.getSchema()).rejects.toThrow('not implemented');
        await expect(adapter.disconnect()).rejects.toThrow('not implemented');
    });

    test('has cancel method that handles null connection gracefully', async () => {
        const adapter = new BaseAdapter({ host: 'localhost' });
        // Should not throw
        await adapter.cancel();
    });

    test('testConnection returns false on connect failure', async () => {
        const adapter = new BaseAdapter({ host: 'localhost' });
        adapter.connect = jest.fn().mockRejectedValue(new Error('Connection refused'));
        const result = await adapter.testConnection();
        expect(result).toBe(false);
    });

    test('testConnection returns true on success', async () => {
        const adapter = new BaseAdapter({ host: 'localhost' });
        adapter.connect = jest.fn().mockResolvedValue(undefined);
        adapter.disconnect = jest.fn().mockResolvedValue(undefined);
        const result = await adapter.testConnection();
        expect(result).toBe(true);
    });
});

describe('PostgreSQLAdapter', () => {
    let MockClient;
    
    beforeEach(() => {
        MockClient = jest.fn().mockImplementation(() => ({
            connect: jest.fn().mockResolvedValue(undefined),
            query: jest.fn().mockResolvedValue({
                fields: [{ name: 'id' }, { name: 'name' }],
                rows: [{ id: 1, name: 'test' }],
                rowCount: 1
            }),
            end: jest.fn().mockResolvedValue(undefined),
            processID: 12345
        }));

        jest.doMock('pg', () => ({ Client: MockClient }));
    });

    afterEach(() => {
        jest.resetModules();
    });

    test('connects with provided options', async () => {
        const PostgreSQLAdapter = require('../services/adapters/postgresql');
        const adapter = new PostgreSQLAdapter({ host: 'db.example.com', port: 5432, user: 'test', password: 'pass', database: 'mydb' });
        await adapter.connect();
        expect(adapter.connected).toBe(true);
    });

    test('executes query and returns formatted result', async () => {
        const PostgreSQLAdapter = require('../services/adapters/postgresql');
        const adapter = new PostgreSQLAdapter({ host: 'localhost', port: 5432, user: 'test', password: 'pass', database: 'mydb' });
        await adapter.connect();
        const result = await adapter.query('SELECT id, name FROM test');
        expect(result.columns).toEqual(['id', 'name']);
        expect(result.data).toHaveLength(1);
        expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    test('disconnect cleans up connection', async () => {
        const PostgreSQLAdapter = require('../services/adapters/postgresql');
        const adapter = new PostgreSQLAdapter({ host: 'localhost', port: 5432, user: 'test', password: 'pass', database: 'mydb' });
        await adapter.connect();
        await adapter.disconnect();
        expect(adapter.connected).toBe(false);
        expect(adapter.connection).toBeNull();
    });

    test('cancel method exists', async () => {
        const PostgreSQLAdapter = require('../services/adapters/postgresql');
        const adapter = new PostgreSQLAdapter({ host: 'localhost', port: 5432, user: 'test', password: 'pass', database: 'mydb' });
        expect(typeof adapter.cancel).toBe('function');
    });
});

describe('MySQLAdapter', () => {
    let mockConnection;

    beforeEach(() => {
        mockConnection = {
            query: jest.fn().mockResolvedValue([
                [{ id: 1, name: 'test' }],
                [{ name: 'id' }, { name: 'name' }]
            ]),
            end: jest.fn().mockResolvedValue(undefined),
            destroy: jest.fn()
        };

        jest.doMock('mysql2/promise', () => ({
            createConnection: jest.fn().mockResolvedValue(mockConnection)
        }));
    });

    afterEach(() => {
        jest.resetModules();
    });

    test('connects and executes query', async () => {
        const MySQLAdapter = require('../services/adapters/mysql');
        const adapter = new MySQLAdapter({ host: 'localhost', port: 3306, user: 'test', password: 'pass', database: 'mydb' });
        await adapter.connect();
        expect(adapter.connected).toBe(true);

        const result = await adapter.query('SELECT * FROM test');
        expect(result.columns).toBeDefined();
        expect(result.data).toHaveLength(1);
    });

    test('cancel method exists', async () => {
        const MySQLAdapter = require('../services/adapters/mysql');
        const adapter = new MySQLAdapter({ host: 'localhost', port: 3306, user: 'test', password: 'pass', database: 'mydb' });
        expect(typeof adapter.cancel).toBe('function');
    });
});
