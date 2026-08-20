/**
 * @file server.js
 * @description yDB Express server entry point.
 * Validates required secrets on startup, applies per-user rate limiting,
 * and enforces first-run setup before full API access.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const config = require('./config'); // Will exit(1) if secrets are missing

const app = express();

// ── Security & Middleware ──────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Per-User Rate Limiting ────────────────────────────────
const { createRateLimiter } = require('./middleware/rate-limit');

// Auth endpoints get the strictest limits (brute-force protection)
app.use('/api/auth/login', createRateLimiter('auth'));
app.use('/api/auth/register', createRateLimiter('auth'));
app.use('/api/auth/refresh', createRateLimiter('auth'));

// Query execution endpoints
app.use('/api/query', createRateLimiter('query'));
app.use('/api/stream', createRateLimiter('query'));
app.use('/api/federated', createRateLimiter('query'));

// General API rate limit — excludes routes that already have dedicated limiters
app.use('/api/connections', createRateLimiter('general'));
app.use('/api/explorer', createRateLimiter('general'));
app.use('/api/export', createRateLimiter('general'));
app.use('/api/import', createRateLimiter('general'));
app.use('/api/users', createRateLimiter('general'));
app.use('/api/audit', createRateLimiter('general'));
app.use('/api/backup', createRateLimiter('general'));
app.use('/api/pool', createRateLimiter('general'));
app.use('/api/metrics', createRateLimiter('general'));

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/query', require('./routes/query'));
app.use('/api/explorer', require('./routes/explorer'));
app.use('/api/export', require('./routes/export'));
app.use('/api/import', require('./routes/import'));
app.use('/api/users', require('./routes/users'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/stream', require('./routes/stream'));
app.use('/api/federated', require('./routes/federated'));

// Pool stats (admin only)
const { authenticate, authorize } = require('./middleware/auth');
const poolManager = require('./services/pool-manager');
app.get('/api/pool/stats', authenticate, authorize('admin'), (req, res) => {
    res.json(poolManager.getStats());
});

// Backup endpoints (admin only)
const backup = require('./services/backup');
app.get('/api/backup/list', authenticate, authorize('admin'), (req, res) => {
    res.json(backup.listBackups());
});
app.post('/api/backup/create', authenticate, authorize('admin'), async (req, res) => {
    try {
        const result = await backup.backupAppDatabase();
        const { logFromRequest } = require('./services/audit-log');
        await logFromRequest(req, 'backup.created', 'backup', { status: 'success', details: { filepath: result } });
        res.json({ success: true, filepath: result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/backup/restore', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { filename, dryRun } = req.body;
        const result = await backup.restoreAppDatabase(filename, dryRun);
        const { logFromRequest } = require('./services/audit-log');
        await logFromRequest(req, 'backup.restored', 'backup', { status: 'success', details: { filename, dryRun } });
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Start backup scheduler in production
if (config.env === 'production') {
    backup.startScheduledBackup();
}

// Metrics endpoint (Prometheus-compatible)
const metrics = require('./services/metrics');
app.get('/metrics', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(metrics.toPrometheus());
});
app.get('/api/metrics', authenticate, authorize('admin'), (req, res) => {
    res.json(metrics.getAll());
});

// ── Serve Frontend (Static Files) ─────────────────────────
app.use(express.static(path.join(__dirname, '..'), {
    index: 'index.html'
}));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Error Handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({
        error: config.env === 'production' ? 'Internal server error' : err.message
    });
});

// ── Start Server ──────────────────────────────────────────
const server = app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════╗
║   yDB Server v1.0.0                      ║
║   Tame any database.                     ║
║                                          ║
║   Port: ${config.port}                              ║
║   Env:  ${config.env.padEnd(30)}║
║   API:  http://localhost:${config.port}/api          ║
║   UI:   http://localhost:${config.port}              ║
║                                          ║
║   Secrets: ✓ JWT_SECRET set              ║
║            ✓ ENCRYPTION_KEY set          ║
║   Rate Limits: per-user (role-based)     ║
╚══════════════════════════════════════════╝
    `);
});

// ── Graceful Shutdown ─────────────────────────────────────
async function shutdown(signal) {
    console.log(`\n[Server] ${signal} received. Shutting down...`);
    server.close();
    await poolManager.releaseAll();
    const { closeAll } = require('./services/ssh-tunnel');
    closeAll();
    const { limiter } = require('./middleware/rate-limit');
    limiter.destroy();
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Prevent unhandled rejections from crashing the server
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] Unhandled rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught exception:', err.message);
    // Don't exit — keep serving
});

module.exports = app;
