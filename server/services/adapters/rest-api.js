/**
 * @file adapters/rest-api.js
 * @description REST API adapter — connects to external APIs via HTTP.
 * Uses bearer token authentication and auto-discovers schema from responses.
 *
 * Connection options:
 *  - host: API base URL (e.g. https://api.example.com)
 *  - password: Bearer token
 *  - database: Base path (e.g. /api/v1)
 *  - options.endpoints: Array of endpoint configs for schema discovery
 */

const BaseAdapter = require('./base');

class RestAPIAdapter extends BaseAdapter {
    async connect() {
        // Validate we can reach the API
        const baseUrl = this._getBaseUrl();
        try {
            const response = await fetch(baseUrl, {
                method: 'GET',
                headers: this._getHeaders(),
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok && response.status !== 404) {
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }
            this.connected = true;
        } catch (err) {
            if (err.name === 'TimeoutError') throw new Error('API connection timeout (10s)');
            throw new Error(`Cannot reach API: ${err.message}`);
        }
    }

    /**
     * Execute a "query" against the API.
     * SQL-like syntax mapped to API calls:
     *  - SELECT * FROM endpoint → GET /endpoint
     *  - SELECT * FROM endpoint WHERE id = 5 → GET /endpoint/5
     *  - SELECT * FROM endpoint LIMIT 10 → GET /endpoint?limit=10
     */
    async query(sql) {
        if (!this.connected) await this.connect();
        const start = Date.now();

        // Parse the SQL-like query into an API call
        const parsed = this._parseSql(sql);
        const url = this._buildUrl(parsed.endpoint, parsed.params);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this._getHeaders(),
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) {
                throw new Error(`API ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const rows = this._extractRows(data);
            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

            return {
                columns,
                data: rows,
                duration: Date.now() - start,
                rowCount: rows.length
            };
        } catch (err) {
            throw new Error(`API request failed: ${err.message}`);
        }
    }

    /**
     * Get schema by calling configured endpoints and inferring structure.
     */
    async getSchema() {
        if (!this.connected) await this.connect();

        const schema = { tables: {} };
        const endpoints = this.opts.endpoints || this.opts.options?.endpoints || [];

        // If endpoints configured, use them
        if (endpoints.length > 0) {
            for (const ep of endpoints) {
                const name = ep.name || ep.path?.replace(/^\//, '').replace(/\//g, '_') || 'data';
                try {
                    const url = this._getBaseUrl() + (ep.path || '/' + name);
                    const response = await fetch(url + '?limit=1&per_page=1&page_size=1', {
                        method: 'GET',
                        headers: this._getHeaders(),
                        signal: AbortSignal.timeout(10000)
                    });
                    if (response.ok) {
                        const data = await response.json();
                        const rows = this._extractRows(data);
                        if (rows.length > 0) {
                            schema.tables[name] = {
                                columns: Object.keys(rows[0]).map(k => ({
                                    name: k,
                                    type: this._inferType(rows[0][k]),
                                    nullable: true,
                                    key: k === 'id' ? 'PK' : ''
                                }))
                            };
                        }
                    }
                } catch (e) { /* skip failed endpoints */ }
            }
        } else {
            // Try common REST endpoints for auto-discovery
            const commonEndpoints = ['users', 'products', 'orders', 'transactions', 'items', 'posts', 'data'];
            for (const ep of commonEndpoints) {
                try {
                    const url = this._getBaseUrl() + '/' + ep + '?limit=1&per_page=1';
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: this._getHeaders(),
                        signal: AbortSignal.timeout(5000)
                    });
                    if (response.ok) {
                        const data = await response.json();
                        const rows = this._extractRows(data);
                        if (rows.length > 0) {
                            schema.tables[ep] = {
                                columns: Object.keys(rows[0]).map(k => ({
                                    name: k,
                                    type: this._inferType(rows[0][k]),
                                    nullable: true,
                                    key: k === 'id' ? 'PK' : ''
                                }))
                            };
                        }
                    }
                } catch (e) { /* skip */ }
            }
        }

        // If no tables discovered, add a placeholder
        if (Object.keys(schema.tables).length === 0) {
            schema.tables['api'] = { columns: [{ name: 'response', type: 'JSON', nullable: true, key: '' }] };
        }

        return schema;
    }

    async disconnect() {
        this.connected = false;
    }

    // ── Private Helpers ──────────────────────────────────────

    _getBaseUrl() {
        let host = this.opts.host || '';
        if (!host.startsWith('http')) host = 'https://' + host;
        host = host.replace(/\/$/, '');
        const basePath = this.opts.database || '';
        return host + (basePath ? '/' + basePath.replace(/^\//, '') : '');
    }

    _getHeaders() {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (this.opts.password) {
            headers['Authorization'] = 'Bearer ' + this.opts.password;
        }
        if (this.opts.user && !this.opts.password) {
            // Use username as API key header
            headers['X-API-Key'] = this.opts.user;
        }
        return headers;
    }

    _parseSql(sql) {
        // Extract table name (endpoint) from SQL
        const fromMatch = sql.match(/FROM\s+(\w+)/i);
        const endpoint = fromMatch ? fromMatch[1] : 'data';

        // Extract WHERE conditions
        const params = {};
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
        if (whereMatch) {
            const conditions = whereMatch[1].split(/\s+AND\s+/i);
            for (const cond of conditions) {
                const m = cond.match(/(\w+)\s*=\s*'?([^']+)'?/);
                if (m) params[m[1]] = m[2];
            }
        }

        // Extract LIMIT
        const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) params['limit'] = limitMatch[1];

        return { endpoint, params };
    }

    _buildUrl(endpoint, params) {
        let url = this._getBaseUrl() + '/' + endpoint;
        const queryParams = Object.entries(params)
            .filter(([k]) => k !== 'id')
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&');

        // If there's an id param, append to path
        if (params.id) url += '/' + params.id;
        if (queryParams) url += '?' + queryParams;

        return url;
    }

    _extractRows(data) {
        // Handle common API response formats
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.data)) return data.data;
        if (data && Array.isArray(data.results)) return data.results;
        if (data && Array.isArray(data.items)) return data.items;
        if (data && Array.isArray(data.records)) return data.records;
        if (data && Array.isArray(data.rows)) return data.rows;
        if (data && Array.isArray(data.list)) return data.list;
        if (data && Array.isArray(data.entries)) return data.entries;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            // Single object response — wrap in array
            return [data];
        }
        return [];
    }

    _inferType(value) {
        if (value === null || value === undefined) return 'TEXT';
        if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'DECIMAL';
        if (typeof value === 'boolean') return 'BOOLEAN';
        if (typeof value === 'object') return 'JSON';
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'DATETIME';
        return 'TEXT';
    }
}

module.exports = RestAPIAdapter;
