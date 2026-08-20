/**
 * @file server.js
 * @description yDB Express server entry point.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./config');

const app = express();

// ── Security & Middleware ──────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

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
        const filepath = await backup.backupAppDatabase();
        res.json({ success: true, filepath });
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
║   yDB Server v${config.env === 'production' ? '1.0.0' : 'DEV'}                     ║
║   Tame any database.                     ║
║                                          ║
║   Port: ${config.port}                              ║
║   Env:  ${config.env.padEnd(30)}║
║   API:  http://localhost:${config.port}/api          ║
║   UI:   http://localhost:${config.port}              ║
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
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
