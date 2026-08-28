/**
 * @file adapters/trino.js
 * @description Trino/Presto adapter — federated SQL query engine.
 * Trino connects to multiple data sources (MySQL, PostgreSQL, Hive, S3, etc.)
 * and executes SQL across them as a single unified engine.
 *
 * Connection options:
 *  - host: Trino coordinator URL (e.g., trino.company.com)
 *  - port: HTTP port (default 8080)
 *  - user: Trino username
 *  - password: (optional) for password-authenticated clusters
 *  - database: Trino catalog.schema (e.g., mysql.production)
 *
 * Trino uses HTTP-based protocol, no native driver needed.
 */

const BaseAdapter = require('./base');

class TrinoAdapter extends BaseAdapter {
    async connect() {
        const url = this._getBaseUrl() + '/v1/info';
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this._getHeaders(),
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) throw new Error(`Trino ${response.status}: ${response.statusText}`);
            this.connected = true;
        } catch (err) {
            throw new Error(`Cannot connect to Trino at ${this.opts.host}:${this.opts.port || 8080}: ${err.message}`);
        }
    }

    async query(sql) {
        if (!this.connected) await this.connect();
        const start = Date.now();
        const url = this._getBaseUrl() + '/v1/statement';

        try {
            // Submit query
            const response = await fetch(url, {
                method: 'POST',
                headers: this._getHeaders(),
                body: sql,
                signal: AbortSignal.timeout(60000)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || `Trino query failed: ${response.status}`);
            }

            let result = await response.json();
            let columns = [];
            let data = [];

            // Trino returns results in pages — follow nextUri
            if (result.columns) {
                columns = result.columns.map(c => c.name);
            }
            if (result.data) {
                data = result.data.map(row => {
                    const obj = {};
                    columns.forEach((col, i) => { obj[col] = row[i]; });
                    return obj;
                });
            }

            // Follow pagination
            while (result.nextUri) {
                await new Promise(r => setTimeout(r, 200));
                const nextResponse = await fetch(result.nextUri, { headers: this._getHeaders(), signal: AbortSignal.timeout(30000) });
                result = await nextResponse.json();
                if (result.columns && !columns.length) {
                    columns = result.columns.map(c => c.name);
                }
                if (result.data) {
                    result.data.forEach(row => {
                        const obj = {};
                        columns.forEach((col, i) => { obj[col] = row[i]; });
                        data.push(obj);
                    });
                }
                if (result.error) throw new Error(result.error.message || 'Trino execution error');
            }

            return { columns, data, duration: Date.now() - start, rowCount: data.length };
        } catch (err) {
            throw new Error(`Trino query error: ${err.message}`);
        }
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const schema = { tables: {} };
        const catalog = this.opts.database?.split('.')[0] || 'system';
        const schemaName = this.opts.database?.split('.')[1] || 'information_schema';

        try {
            // Get tables
            const tablesResult = await this.query(`SHOW TABLES FROM ${catalog}.${schemaName}`);
            for (const row of tablesResult.data) {
                const tableName = Object.values(row)[0];
                try {
                    const colsResult = await this.query(`DESCRIBE ${catalog}.${schemaName}.${tableName}`);
                    schema.tables[tableName] = {
                        columns: colsResult.data.map(c => ({
                            name: c['Column'] || c.column_name || Object.values(c)[0],
                            type: (c['Type'] || c.data_type || Object.values(c)[1] || '').toUpperCase(),
                            nullable: true,
                            key: ''
                        }))
                    };
                } catch (e) { /* skip inaccessible tables */ }
            }
        } catch (e) {
            // Fallback: try information_schema
            try {
                const result = await this.query(`SELECT table_name, column_name, data_type FROM ${catalog}.information_schema.columns WHERE table_schema = '${schemaName}' ORDER BY table_name, ordinal_position`);
                for (const row of result.data) {
                    const t = row.table_name;
                    if (!schema.tables[t]) schema.tables[t] = { columns: [] };
                    schema.tables[t].columns.push({ name: row.column_name, type: (row.data_type || '').toUpperCase(), nullable: true, key: '' });
                }
            } catch (e2) { /* empty schema */ }
        }

        return schema;
    }

    async disconnect() {
        this.connected = false;
    }

    // Private helpers

    _getBaseUrl() {
        const host = this.opts.host || 'localhost';
        const port = this.opts.port || 8080;
        const protocol = port === 443 || port === 8443 ? 'https' : 'http';
        return `${protocol}://${host}:${port}`;
    }

    _getHeaders() {
        const headers = { 'Content-Type': 'text/plain', 'X-Trino-User': this.opts.user || 'ydb' };
        if (this.opts.database) {
            const parts = this.opts.database.split('.');
            if (parts[0]) headers['X-Trino-Catalog'] = parts[0];
            if (parts[1]) headers['X-Trino-Schema'] = parts[1];
        }
        if (this.opts.password) {
            headers['Authorization'] = 'Basic ' + Buffer.from((this.opts.user || 'ydb') + ':' + this.opts.password).toString('base64');
        }
        return headers;
    }
}

module.exports = TrinoAdapter;
