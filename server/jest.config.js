/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverageFrom: [
        'routes/**/*.js',
        'middleware/**/*.js',
        'services/**/*.js',
        '!services/adapters/index.js',
        '!**/node_modules/**'
    ],
    coverageThreshold: {
        global: {
            branches: 60,
            functions: 60,
            lines: 60,
            statements: 60
        }
    },
    coverageReporters: ['text', 'lcov', 'clover'],
    testTimeout: 15000
};
