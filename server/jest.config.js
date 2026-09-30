/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverageFrom: [
        'middleware/**/*.js',
        'services/audit-log.js',
        'services/backup.js',
        'services/crypto.js',
        'services/ssrf-guard.js',
        'services/adapters/base.js',
        'services/adapters/ssl.js',
        'services/adapters/postgresql.js',
        'services/adapters/mysql.js',
        '!**/node_modules/**'
    ],
    coverageReporters: ['text', 'lcov'],
    testTimeout: 15000
};
