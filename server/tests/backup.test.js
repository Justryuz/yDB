/**
 * @file tests/backup.test.js
 * @description Tests for backup and restore service.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');

// Mock db/pool
const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn()
};

jest.mock('../db/pool', () => ({
    query: mockQuery,
    pool: {
        connect: jest.fn().mockResolvedValue(mockClient),
        end: jest.fn()
    }
}));

// Mock fs for backup tests
jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        existsSync: jest.fn().mockReturnValue(true),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        readFileSync: jest.fn(),
        readdirSync: jest.fn().mockReturnValue([]),
        statSync: jest.fn().mockReturnValue({ size: 1024, mtime: new Date(), mtimeMs: Date.now() }),
        unlinkSync: jest.fn()
    };
});

const backup = require('../services/backup');

describe('Backup Service', () => {
    beforeEach(() => {
        mockQuery.mockClear();
        mockClient.query.mockClear();
        fs.writeFileSync.mockClear();
    });

    test('backupAppDatabase creates a JSON backup file', async () => {
        mockQuery.mockResolvedValue({ rows: [{ id: 1, username: 'admin' }] });

        const filepath = await backup.backupAppDatabase();
        expect(filepath).toContain('ydb_app_');
        expect(filepath).toContain('.json');
        expect(fs.writeFileSync).toHaveBeenCalled();

        const [, content] = fs.writeFileSync.mock.calls[0];
        const parsed = JSON.parse(content);
        expect(parsed.version).toBe('2.0');
        expect(parsed.tables).toBeDefined();
    });

    test('listBackups returns sorted file list', () => {
        fs.readdirSync.mockReturnValue(['backup1.json', 'backup2.json', 'not-a-backup.txt']);
        const list = backup.listBackups();
        expect(list).toHaveLength(2);
        expect(list[0].format).toBe('json');
    });

    test('restoreAppDatabase in dry-run mode does not modify data', async () => {
        const mockBackup = {
            version: '2.0',
            created_at: '2024-01-01T00:00:00Z',
            tables: {
                users: { rowCount: 2, columns: ['id', 'username'], data: [] }
            }
        };
        fs.readFileSync.mockReturnValue(JSON.stringify(mockBackup));

        const result = await backup.restoreAppDatabase('test-backup.json', true);
        expect(result.dryRun).toBe(true);
        expect(result.preview).toBeDefined();
        // Should NOT have called TRUNCATE or INSERT in dry-run
        expect(mockClient.query).not.toHaveBeenCalledWith(expect.stringContaining('TRUNCATE'));
    });

    test('restoreAppDatabase throws for invalid file format', async () => {
        fs.readFileSync.mockReturnValue('not json at all');
        await expect(backup.restoreAppDatabase('bad.json', true)).rejects.toThrow('Invalid backup file format');
    });

    test('restoreAppDatabase throws for missing file', async () => {
        // Mock existsSync to return true for backup dir, then false for the file
        fs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
        await expect(backup.restoreAppDatabase('missing.json', true)).rejects.toThrow('not found');
    });
});
