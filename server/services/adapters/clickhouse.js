/**
 * @file adapters/clickhouse.js
 * @description ClickHouse adapter using '@clickhouse/client'.
 */

const BaseAdapter = require('./base');

class ClickHouseAdapter extends BaseAdapter {
    async connect() {
        const { createClient } = require('@clickhouse/client');
        this.client = createClient({
            url: `http://${this.opts.host}:${this.opts.port || 8123}`,
            username: this.opts.user || 'default',
            password: this.opts.password || '',
            database: this.opts.database || 'default',
            request_timeout: 30000
        });
        // Test connectivity
        await this.client.ping();
        this.connected = true;
    }

    async query(sql) {
        if (!this.connected) await this.connect();
        const start = Date.now();
        const result = await this.client.query({ query: sql, format: 'JSONEachRow' });
        const data = await result.json();

        const columns = data.length ? Object.keys(data[0]) : [];
        return { columns, data, duration: Date.now() - start, rowCount: data.length };
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const result = await this.client.query({
            query: `SELECT table, name, type FROM system.columns WHERE database = '${this.opts.database || 'default'}' ORDER BY table, position`,
            format: 'JSONEachRow'
        });
        const rows = await result.json();
        const schema = { tables: {} };

        rows.forEach(row => {
            if (!schema.tables[row.table]) schema.tables[row.table] = { columns: [] };
            schema.tables[row.table].columns.push({
                name: row.name,
                type: row.type.toUpperCase(),
                nullable: row.type.includes('Nullable'),
                key: ''
            });
        });
        return schema;
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.client = null;
        }
        this.connected = false;
    }
}

module.exports = ClickHouseAdapter;
