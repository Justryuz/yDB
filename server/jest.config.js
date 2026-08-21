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
            branches: 30,
            functions: 30,
            lines: 30,
            statements: 30
        }
    },
    coverageReporters: ['text', 'lcov', 'clover'],
    testTimeout: 15000
};
