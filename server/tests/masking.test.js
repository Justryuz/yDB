/**
 * @file tests/masking.test.js
 * @description Tests for the data masking middleware.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

jest.mock('../db/pool', () => ({
    query: jest.fn(),
    pool: { connect: jest.fn(), end: jest.fn() }
}));

const { applyMasking } = require('../middleware/masking');

describe('Data Masking Middleware', () => {
    const sampleResult = {
        columns: ['id', 'name', 'email', 'ssn', 'credit_card'],
        data: [
            { id: 1, name: 'John Doe', email: 'john@example.com', ssn: '123-45-6789', credit_card: '4111111111111111' }
        ],
        duration: 10,
        rowCount: 1
    };

    test('admin role sees unmasked data', () => {
        const result = applyMasking(sampleResult, 'admin');
        expect(result.data[0].email).toBe('john@example.com');
    });

    test('applyMasking returns data without crashing for any role', () => {
        // Should not throw for any role
        expect(() => applyMasking(sampleResult, 'viewer')).not.toThrow();
        expect(() => applyMasking(sampleResult, 'editor')).not.toThrow();
        expect(() => applyMasking(sampleResult, 'admin')).not.toThrow();
    });

    test('handles empty data gracefully', () => {
        const emptyResult = { columns: ['id'], data: [], duration: 0, rowCount: 0 };
        const result = applyMasking(emptyResult, 'viewer');
        expect(result.data).toHaveLength(0);
    });

    test('handles null/undefined result gracefully', () => {
        // admin path returns result directly (null/undefined pass through)
        expect(applyMasking(null, 'admin')).toBeNull();
        expect(applyMasking(undefined, 'admin')).toBeUndefined();
        // non-admin with object missing columns/data returns early
        const noFields = { duration: 5 };
        const result = applyMasking(noFields, 'viewer');
        expect(result).toEqual(noFields);
    });
});
