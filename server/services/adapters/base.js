/**
 * @file adapters/base.js
 * @description Base adapter interface. All database adapters must implement this contract.
 */

class BaseAdapter {
    constructor(opts) {
        this.opts = opts;
        this.connection = null;
        this.connected = false;
    }

    /** Connect to the database. Must be called before query/getSchema. */
    async connect() { throw new Error('connect() not implemented'); }

    /** Execute a SQL/query string. Returns { columns, data, duration, rowCount } */
    async query(sql) { throw new Error('query() not implemented'); }

    /** Get database schema (tables + columns). Returns { tables: { name: { columns } } } */
    async getSchema() { throw new Error('getSchema() not implemented'); }

    /** Cancel a running query (best-effort — not all adapters support this). */
    async cancel() {
        // Default: destroy the connection to force abort
        if (this.connection && typeof this.connection.destroy === 'function') {
            this.connection.destroy();
        }
    }

    /** Disconnect and clean up resources. */
    async disconnect() { throw new Error('disconnect() not implemented'); }

    /** Test if connection is viable. Returns boolean. */
    async testConnection() {
        try {
            await this.connect();
            await this.disconnect();
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = BaseAdapter;
