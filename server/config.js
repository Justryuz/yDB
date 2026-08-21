/**
 * @file config.js
 * @description Load environment variables and export app configuration.
 * Critical secrets (JWT_SECRET, ENCRYPTION_KEY) have NO fallback —
 * the server refuses to start without them.
 */

require('dotenv').config();

// ── Required Secrets Validation ───────────────────────────────────────────
const REQUIRED_SECRETS = ['JWT_SECRET', 'ENCRYPTION_KEY'];
const missing = REQUIRED_SECRETS.filter(key => !process.env[key]);

if (missing.length > 0) {
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║   FATAL: Required secrets not set. Server cannot start.     ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    missing.forEach(key => {
        console.error(`║   Missing: ${key.padEnd(47)}║`);
    });
    console.error('║                                                              ║');
    console.error('║   Set these in your .env file or environment variables.      ║');
    console.error('║   See .env.example for guidance.                             ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    process.exit(1);
}

// Validate minimum key lengths
if (process.env.JWT_SECRET.length < 32) {
    console.error('[FATAL] JWT_SECRET must be at least 32 characters long.');
    process.exit(1);
}
if (process.env.ENCRYPTION_KEY.length < 32) {
    console.error('[FATAL] ENCRYPTION_KEY must be at least 32 characters long.');
    process.exit(1);
}

module.exports = {
    port: parseInt(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || 'development',

    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },

    db: {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT) || 5432,
        user: process.env.PG_USER || 'ydb',
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE || 'ydb_app'
    },

    encryptionKey: process.env.ENCRYPTION_KEY,

    // Password policy configuration
    passwordPolicy: {
        minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecial: true
    },

    // Rate limiting (per-user)
    rateLimits: {
        auth: { windowMs: 15 * 60 * 1000, max: parseInt(process.env.RATE_LIMIT_AUTH) || 10 },
        query: { windowMs: 15 * 60 * 1000, max: parseInt(process.env.RATE_LIMIT_QUERY) || 200 },
        general: { windowMs: 15 * 60 * 1000, max: parseInt(process.env.RATE_LIMIT_GENERAL) || 500 }
    },

    // Backup
    backup: {
        target: process.env.BACKUP_TARGET || 'local', // 'local' or 's3'
        s3Bucket: process.env.BACKUP_S3_BUCKET || '',
        s3Region: process.env.BACKUP_S3_REGION || 'us-east-1',
        intervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS) || 6,
        retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30
    },

    // NLQ (Natural Language Query) — Text-to-SQL AI provider
    nlq: {
        provider: process.env.NLQ_PROVIDER || 'builtin', // 'builtin', 'bedrock', 'openai'
        model: process.env.NLQ_MODEL || 'anthropic.claude-3-haiku-20240307-v1:0',
        region: process.env.NLQ_REGION || 'us-east-1',
        apiKey: process.env.NLQ_API_KEY || '',
        baseUrl: process.env.NLQ_BASE_URL || 'https://api.openai.com/v1'
    }
};
