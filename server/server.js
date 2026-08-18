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
app.listen(config.port, () => {
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

module.exports = app;
