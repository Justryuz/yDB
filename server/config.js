/**
 * @file config.js
 * @description Load environment variables and export app configuration.
 */

require('dotenv').config();

module.exports = {
    port: parseInt(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || 'development',

    jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },

    db: {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT) || 5432,
        user: process.env.PG_USER || 'ydb',
        password: process.env.PG_PASSWORD || 'ydb_secret',
        database: process.env.PG_DATABASE || 'ydb_app'
    },

    encryptionKey: process.env.ENCRYPTION_KEY || 'default-key-change-in-prod!!!!'
};
