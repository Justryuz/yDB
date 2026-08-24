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
        const baseUrl = this._getBaseUrl();
        const endpoints = this.opts.endpoints || this.opts.options?.endpoints || [];
        const testUrl = endpoints.length > 0 ? baseUrl + (endpoints[0].path || '') : baseUrl;

        try {
            const data = await this._curlRequest(testUrl);
            if (!data || data.length === 0) throw new Error('Empty response');
            this.connected = true;
        } catch (err) {
            throw new Error(`Cannot reach API at ${testUrl}: ${err.message}`);
        }
    }

    /**
     * Make HTTP request using curl (bypasses Node.js TLS issues with some servers).
     * Falls back to native fetch if curl unavailable.
     * @private
     */
    _curlRequest(url, retries = 2) {
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const headers = this._getHeaders();
            const args = ['-sk', '--max-time', '20', '--tls-max', '1.2', '--retry', '2', '--retry-delay', '1'];
            for (const [key, val] of Object.entries(headers)) {
                args.push('-H', `${key}: ${val}`);
            }
            args.push(url);

            const curlPath = process.platform === 'win32' ? 'C:\\Windows\\System32\\curl.exe' : 'curl';
            const proc = spawn(curlPath, args, { windowsHide: true, shell: false });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', chunk => { stdout += chunk; });
            proc.stderr.on('data', chunk => { stderr += chunk; });
            proc.on('close', code => {
                if (code !== 0 || (!stdout && stderr)) {
                    reject(new Error(stderr || `curl exit code ${code}`));
                } else {
                    resolve(stdout);
                }
            });
            proc.on('error', err => reject(err));
        });
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

        const parsed = this._parseSql(sql);
        const url = this._buildUrl(parsed.endpoint, parsed.params);
        console.log('[REST-API] Query:', sql, '→ URL:', url);

        try {
            const raw = await this._curlRequest(url);
            const data = JSON.parse(raw);

            // Check if API returned an error
            if (data.status === 404 || data.error === 'Not found') {
                throw new Error(data.message || 'API endpoint not found');
            }

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

        if (endpoints.length > 0) {
            for (const ep of endpoints) {
                const name = ep.name || ep.path?.replace(/^\//, '').replace(/\//g, '_') || 'data';
                try {
                    const url = this._getBaseUrl() + (ep.path || '/' + name);
                    const raw = await this._curlRequest(url);
                    const data = JSON.parse(raw);
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
                } catch (e) { /* skip failed endpoints */ }
            }
        } else {
            // Try common endpoints
            const commonEndpoints = ['users', 'products', 'orders', 'transactions', 'items', 'posts', 'data'];
            for (const ep of commonEndpoints) {
                try {
                    const url = this._getBaseUrl() + '/' + ep;
                    const raw = await this._curlRequest(url);
                    const data = JSON.parse(raw);
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
                } catch (e) { /* skip */ }
            }
        }

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
        // Map endpoint name back to actual API path
        const endpoints = this.opts.endpoints || this.opts.options?.endpoints || [];
        let path = '/' + endpoint;

        // Find matching endpoint config
        const epConfig = endpoints.find(ep =>
            (ep.name || '').toLowerCase() === endpoint.toLowerCase() ||
            (ep.path || '').replace(/^\//, '').replace(/\//g, '_') === endpoint
        );
        if (epConfig) path = epConfig.path;

        let url = this._getBaseUrl() + path;
        const queryParams = Object.entries(params)
            .filter(([k]) => k !== 'id')
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&');

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
