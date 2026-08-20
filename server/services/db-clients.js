/**
 * @file services/db-clients.js
 * @description Legacy compatibility layer — wraps new adapter system.
 * Routes that still use getClient() will work through here.
 * New code should use pool-manager.js + adapters directly.
 */

const { createAdapter } = require('./adapters');

function getClient(dbType) {
    return {
        async testConnection(opts) {
            const adapter = createAdapter(dbType, opts);
            return adapter.testConnection();
        },
        async execute(opts, sql) {
            const adapter = createAdapter(dbType, opts);
            try {
                await adapter.connect();
                return await adapter.query(sql);
            } finally {
                await adapter.disconnect();
            }
        },
        async getSchemas(opts) {
            const adapter = createAdapter(dbType, opts);
            try {
                await adapter.connect();
                return await adapter.getSchema();
            } finally {
                await adapter.disconnect();
            }
        }
    };
}

module.exports = { getClient };
