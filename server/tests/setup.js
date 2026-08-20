/**
 * @file tests/setup.js
 * @description Test setup utilities — mock database and environment.
 */

// Set required environment variables before loading config
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.PG_HOST = 'localhost';
process.env.PG_PORT = '5432';
process.env.PG_USER = 'test';
process.env.PG_PASSWORD = 'test';
process.env.PG_DATABASE = 'ydb_test';
process.env.NODE_ENV = 'test';

/**
 * Create a mock database module.
 */
function createMockDb() {
    const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const mockPool = {
        connect: jest.fn().mockResolvedValue({
            query: mockQuery,
            release: jest.fn()
        }),
        end: jest.fn()
    };

    return { query: mockQuery, pool: mockPool };
}

module.exports = { createMockDb };
