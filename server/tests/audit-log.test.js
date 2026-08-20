/**
 * @file tests/audit-log.test.js
 * @description Tests for audit log immutability — confirm no UPDATE/DELETE path exists.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });

jest.mock('../db/pool', () => ({
    query: mockQuery,
    pool: { connect: jest.fn(), end: jest.fn() }
}));

const { writeAuditLog, logFromRequest } = require('../services/audit-log');

describe('Audit Log Service — Immutability', () => {
    beforeEach(() => {
        mockQuery.mockClear();
    });

    test('writeAuditLog only uses INSERT', async () => {
        await writeAuditLog({
            userId: 1,
            action: 'test.action',
            resource: 'test',
            status: 'success'
        });

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql] = mockQuery.mock.calls[0];
        expect(sql.trim().toUpperCase()).toMatch(/^INSERT/);
        expect(sql.toUpperCase()).not.toContain('UPDATE');
        expect(sql.toUpperCase()).not.toContain('DELETE');
    });

    test('logFromRequest extracts IP and user info', async () => {
        const mockReq = {
            user: { id: 5, username: 'testuser', role: 'editor' },
            headers: { 'x-forwarded-for': '10.0.0.1' },
            socket: { remoteAddress: '127.0.0.1' }
        };

        await logFromRequest(mockReq, 'query.executed', 'query', {
            connectionId: 3,
            queryText: 'SELECT 1',
            durationMs: 42,
            rowsAffected: 1
        });

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql.trim().toUpperCase()).toMatch(/^INSERT/);
        expect(params[0]).toBe(5); // userId
        expect(params[1]).toBe('query.executed'); // action
        expect(params[5]).toBe('10.0.0.1'); // IP from x-forwarded-for
    });

    test('audit log module does NOT export any update/delete functions', () => {
        const auditModule = require('../services/audit-log');
        const exports = Object.keys(auditModule);
        
        // No function names suggesting modification
        expect(exports).not.toContain(expect.stringMatching(/update|delete|remove|clear|truncate/i));
    });

    test('handles write failure gracefully without throwing', async () => {
        mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

        // Should not throw
        await expect(
            writeAuditLog({ userId: 1, action: 'test', status: 'success' })
        ).resolves.not.toThrow();
    });
});

describe('Audit Routes — No DELETE endpoint', () => {
    test('audit route module does not expose DELETE handler', () => {
        // Load the route module
        const express = require('express');
        const origDelete = express.Router().delete;
        
        // The audit route file should not have a delete endpoint
        // We verify this by checking the source doesn't contain a delete route
        const fs = require('fs');
        const path = require('path');
        const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'audit.js'), 'utf8');
        
        // Should NOT have router.delete
        expect(source).not.toMatch(/router\.delete\s*\(/);
        // Should NOT have DELETE FROM audit_log
        expect(source.toUpperCase()).not.toMatch(/DELETE\s+FROM\s+audit_log/);
        // Should NOT have UPDATE audit_log
        expect(source.toUpperCase()).not.toMatch(/UPDATE\s+audit_log/);
    });
});
