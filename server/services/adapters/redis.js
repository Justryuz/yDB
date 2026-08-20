/**
 * @file adapters/redis.js
 * @description Redis adapter using 'ioredis' driver.
 */

const BaseAdapter = require('./base');

class RedisAdapter extends BaseAdapter {
    async connect() {
        const Redis = require('ioredis');
        this.client = new Redis({ host: this.opts.host, port: this.opts.port, password: this.opts.password, connectTimeout: 5000, lazyConnect: true });
        await this.client.connect();
        this.connected = true;
    }

    async query(cmd) {
        if (!this.connected) await this.connect();
        const start = Date.now();
        const parts = cmd.trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        let result;
        try { result = await this.client.call(command, ...args); } catch (e) { return { columns: ['error'], data: [{ error: e.message }], duration: Date.now() - start, rowCount: 1 }; }
        if (typeof result === 'string' || typeof result === 'number') {
            return { columns: ['result'], data: [{ result }], duration: Date.now() - start, rowCount: 1 };
        }
        if (Array.isArray(result)) {
            return { columns: ['key', 'value'], data: result.map((v, i) => ({ key: i, value: v })), duration: Date.now() - start, rowCount: result.length };
        }
        return { columns: ['result'], data: [{ result: JSON.stringify(result) }], duration: Date.now() - start, rowCount: 1 };
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const info = await this.client.info('keyspace');
        return { tables: { _keyspace: { columns: [{ name: 'info', type: 'TEXT', nullable: false, key: '' }] } } };
    }

    async disconnect() {
        if (this.client) { await this.client.quit(); this.client = null; this.connected = false; }
    }
}

module.exports = RedisAdapter;
