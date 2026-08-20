/**
 * @file api.js
 * @description HTTP API client for the yDB backend.
 * All API calls go through this module. Handles JWT tokens, errors, and fallback to mock mode.
 *
 * Usage:
 *   YDB.API.post('/auth/login', { username, password })
 *   YDB.API.get('/connections')
 *   YDB.API.isOnline() — check if backend is reachable
 *
 * When backend is unavailable, YDB runs in "mock mode" using local data.
 */

YDB.API = {

    /** @type {string} Base URL for API endpoints */
    baseURL: '/api',

    /** @type {string|null} JWT token stored in memory */
    token: null,

    /** @type {boolean} Whether backend is reachable */
    online: false,

    /**
     * Initialize API — check if backend is available, restore token from storage.
     */
    init: function () {
        var stored = localStorage.getItem('ydb-token');
        this.token = (stored && stored !== 'null') ? stored : null;
        this._checkOnline();
    },

    /**
     * Check if backend API is reachable.
     * Uses the public setup-status endpoint (no auth required).
     * Sets this.online flag.
     */
    _checkOnline: function () {
        var self = this;
        try {
            fetch(this.baseURL + '/auth/setup-status', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }).then(function (res) {
                var ct = res.headers.get('content-type') || '';
                self.online = ct.indexOf('application/json') >= 0;
            }).catch(function () {
                self.online = false;
            });
        } catch (e) {
            self.online = false;
        }
    },

    /**
     * @returns {boolean} True if backend is reachable
     */
    isOnline: function () {
        return this.online;
    },

    /**
     * Store JWT token after login.
     * @param {string} token
     */
    setToken: function (token) {
        this.token = token;
        localStorage.setItem('ydb-token', token);
    },

    /**
     * Clear token on logout.
     */
    clearToken: function () {
        this.token = null;
        localStorage.removeItem('ydb-token');
    },

    /**
     * Build request headers.
     * @private
     * @returns {Object}
     */
    _headers: function () {
        var h = { 'Content-Type': 'application/json' };
        if (this.token) h['Authorization'] = 'Bearer ' + this.token;
        return h;
    },

    /**
     * GET request.
     * @param {string} path - API path (e.g. '/connections')
     * @returns {Promise<Object>}
     */
    get: function (path) {
        return fetch(this.baseURL + path, {
            method: 'GET',
            headers: this._headers()
        }).then(this._handleResponse);
    },

    /**
     * POST request.
     * @param {string} path - API path
     * @param {Object} body - Request body
     * @returns {Promise<Object>}
     */
    post: function (path, body) {
        return fetch(this.baseURL + path, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(body)
        }).then(this._handleResponse);
    },

    /**
     * PUT request.
     * @param {string} path - API path
     * @param {Object} body - Request body
     * @returns {Promise<Object>}
     */
    put: function (path, body) {
        return fetch(this.baseURL + path, {
            method: 'PUT',
            headers: this._headers(),
            body: JSON.stringify(body)
        }).then(this._handleResponse);
    },

    /**
     * DELETE request.
     * @param {string} path - API path
     * @returns {Promise<Object>}
     */
    del: function (path) {
        return fetch(this.baseURL + path, {
            method: 'DELETE',
            headers: this._headers()
        }).then(this._handleResponse);
    },

    /**
     * Upload file via POST multipart.
     * @param {string} path - API path
     * @param {FormData} formData
     * @returns {Promise<Object>}
     */
    upload: function (path, formData) {
        var h = {};
        if (this.token) h['Authorization'] = 'Bearer ' + this.token;
        return fetch(this.baseURL + path, {
            method: 'POST',
            headers: h,
            body: formData
        }).then(this._handleResponse);
    },

    /**
     * Handle fetch response — parse JSON, throw on error.
     * @private
     * @param {Response} res
     * @returns {Promise<Object>}
     */
    _handleResponse: function (res) {
        var ct = res.headers.get('content-type') || '';
        if (ct.indexOf('application/json') < 0) {
            var err = new Error('Backend not available');
            err.status = 0;
            return Promise.reject(err);
        }
        return res.json().then(function (data) {
            if (!res.ok) {
                var err = new Error(data.error || 'Request failed');
                err.status = res.status;
                err.details = data.details || null;
                err.retryAfter = data.retryAfter || null;
                throw err;
            }
            return data;
        });
    },

    // ══════════════════════════════════════════════════════════
    // SSE STREAMING
    // ══════════════════════════════════════════════════════════

    /**
     * Stream a query result via SSE (Server-Sent Events).
     * @param {string|number} connectionId
     * @param {string} sql
     * @param {Object} callbacks - { onColumns, onBatch, onDone, onError }
     * @returns {EventSource} — call .close() to cancel
     */
    stream: function (connectionId, sql, callbacks) {
        var url = this.baseURL + '/stream/query?connectionId=' + encodeURIComponent(connectionId)
            + '&sql=' + encodeURIComponent(sql)
            + '&token=' + encodeURIComponent(this.token || '');

        var es = new EventSource(url);

        es.addEventListener('columns', function (e) {
            if (callbacks.onColumns) callbacks.onColumns(JSON.parse(e.data));
        });

        es.addEventListener('batch', function (e) {
            if (callbacks.onBatch) callbacks.onBatch(JSON.parse(e.data));
        });

        es.addEventListener('done', function (e) {
            var data = JSON.parse(e.data);
            if (callbacks.onDone) callbacks.onDone(data);
            es.close();
        });

        es.addEventListener('error', function (e) {
            if (e.data) {
                var data = JSON.parse(e.data);
                if (callbacks.onError) callbacks.onError(data.error || 'Stream error');
            } else {
                if (callbacks.onError) callbacks.onError('Connection lost');
            }
            es.close();
        });

        return es;
    }
};
