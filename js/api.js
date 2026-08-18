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
        this.token = localStorage.getItem('ydb-token') || null;
        this._checkOnline();
    },

    /**
     * Check if backend API is reachable.
     * Sets this.online flag.
     */
    _checkOnline: function () {
        var self = this;
        fetch(this.baseURL + '/auth/me', {
            method: 'GET',
            headers: this._headers()
        }).then(function (res) {
            self.online = res.status !== 502 && res.status !== 0;
        }).catch(function () {
            self.online = false;
        });
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
        return res.json().then(function (data) {
            if (!res.ok) {
                var err = new Error(data.error || 'Request failed');
                err.status = res.status;
                throw err;
            }
            return data;
        });
    }
};
