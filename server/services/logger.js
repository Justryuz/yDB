/**
 * @file services/logger.js
 * @description Structured JSON logger for production observability.
 */

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = process.env.LOG_LEVEL || 'info';

function log(level, message, meta = {}) {
    if (levels[level] > levels[currentLevel]) return;
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta,
        pid: process.pid
    };
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else console.log(line);
}

module.exports = {
    error: (msg, meta) => log('error', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    debug: (msg, meta) => log('debug', msg, meta)
};
