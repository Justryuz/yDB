/**
 * @file api-client.js
 * @description Built-in API client (like Postman) — send HTTP requests, manage collections,
 * test APIs with bearer tokens, connect to databases via API.
 * @module YDB.APIClient
 */

YDB.APIClient = {
    collections: [],

    init: function () {
        var self = this;
        this._load();

        // Send button
        document.getElementById('btn-api-send').addEventListener('click', function () { self.send(); });

        // AI Generate Tests button
        document.getElementById('btn-api-ai-tests').addEventListener('click', function () { self.aiGenerateTests(); });

        // Save button
        document.getElementById('btn-api-save').addEventListener('click', function () { self.saveRequest(); });

        // Use yDB token
        document.getElementById('btn-api-use-ydb-token').addEventListener('click', function () {
            document.getElementById('api-token').value = YDB.API.token || '';
            YDB.UI.toast('yDB token applied', 'success');
        });

        // Add header
        document.getElementById('btn-api-add-header').addEventListener('click', function () { self._addRow('api-headers-list'); });

        // Add param
        document.getElementById('btn-api-add-param').addEventListener('click', function () { self._addRow('api-params-list'); });

        // Request sub-tabs
        document.querySelectorAll('#api-req-tabs .tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                document.querySelectorAll('#api-req-tabs .tab').forEach(function (t) { t.classList.remove('tab-active'); });
                this.classList.add('tab-active');
                document.querySelectorAll('.api-subtab').forEach(function (p) { p.style.display = 'none'; });
                document.getElementById('api-sub-' + this.dataset.apitab).style.display = 'block';
            });
        });

        // Auth type toggle
        document.getElementById('api-auth-type').addEventListener('change', function () {
            document.getElementById('api-auth-bearer').classList.toggle('hidden', this.value !== 'bearer');
            document.getElementById('api-auth-basic').classList.toggle('hidden', this.value !== 'basic');
            document.getElementById('api-auth-apikey').classList.toggle('hidden', this.value !== 'apikey');
        });

        // Enter key in URL sends request
        document.getElementById('api-url').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') self.send();
        });

        // Pre-fill URL with yDB API base
        document.getElementById('api-url').value = window.location.origin + '/api/connections';

        this.renderCollections();
    },

    /**
     * Send the HTTP request
     */
    send: function () {
        var method = document.getElementById('api-method').value;
        var url = document.getElementById('api-url').value.trim();
        if (!url) { YDB.UI.toast('Enter a URL', 'warning'); return; }

        // Build headers
        var headers = {};
        document.querySelectorAll('#api-headers-list .flex').forEach(function (row) {
            var inputs = row.querySelectorAll('input');
            if (inputs[0].value && inputs[1].value) headers[inputs[0].value] = inputs[1].value;
        });

        // Auth
        var authType = document.getElementById('api-auth-type').value;
        if (authType === 'bearer') {
            var token = document.getElementById('api-token').value;
            if (token) headers['Authorization'] = 'Bearer ' + token;
        } else if (authType === 'basic') {
            var user = document.getElementById('api-basic-user').value;
            var pass = document.getElementById('api-basic-pass').value;
            if (user) headers['Authorization'] = 'Basic ' + btoa(user + ':' + pass);
        } else if (authType === 'apikey') {
            var keyName = document.getElementById('api-key-name').value;
            var keyValue = document.getElementById('api-key-value').value;
            if (keyName && keyValue) headers[keyName] = keyValue;
        }

        // Query params
        var params = [];
        document.querySelectorAll('#api-params-list .flex').forEach(function (row) {
            var inputs = row.querySelectorAll('input');
            if (inputs[0].value) params.push(inputs[0].value + '=' + encodeURIComponent(inputs[1].value || ''));
        });
        if (params.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + params.join('&');

        // Body
        var body = null;
        if (method !== 'GET' && method !== 'HEAD') {
            body = document.getElementById('api-body').value || null;
        }

        // Show loading
        document.getElementById('api-response').textContent = 'Sending...';
        document.getElementById('api-res-status').textContent = '';
        document.getElementById('api-res-time').textContent = '';
        document.getElementById('api-res-size').textContent = '';

        var startTime = Date.now();

        var fetchOpts = { method: method, headers: headers };
        if (body) fetchOpts.body = body;

        fetch(url, fetchOpts)
            .then(function (res) {
                var elapsed = Date.now() - startTime;
                var statusClass = res.ok ? 'badge-success' : (res.status >= 400 ? 'badge-error' : 'badge-warning');
                document.getElementById('api-res-status').textContent = res.status + ' ' + res.statusText;
                document.getElementById('api-res-status').className = 'badge badge-sm ' + statusClass;
                document.getElementById('api-res-time').textContent = elapsed + 'ms';

                return res.text().then(function (text) {
                    document.getElementById('api-res-size').textContent = (text.length / 1024).toFixed(1) + ' KB';
                    // Try to pretty-print JSON
                    try {
                        var json = JSON.parse(text);
                        document.getElementById('api-response').textContent = JSON.stringify(json, null, 2);
                    } catch (e) {
                        document.getElementById('api-response').textContent = text;
                    }
                });
            })
            .catch(function (err) {
                document.getElementById('api-res-status').textContent = 'Error';
                document.getElementById('api-res-status').className = 'badge badge-sm badge-error';
                document.getElementById('api-response').textContent = 'Network Error: ' + err.message;
            });
    },

    /**
     * Save current request to collections
     */
    saveRequest: function () {
        var name = prompt('Request name:');
        if (!name) return;

        this.collections.push({
            id: Date.now(),
            name: name,
            method: document.getElementById('api-method').value,
            url: document.getElementById('api-url').value,
            body: document.getElementById('api-body').value,
            token: document.getElementById('api-token').value
        });
        this._save();
        this.renderCollections();
        YDB.UI.toast('Request saved', 'success');
    },

    /**
     * Load a saved request
     */
    loadRequest: function (id) {
        var req = this.collections.find(function (r) { return r.id === id; });
        if (!req) return;
        document.getElementById('api-method').value = req.method;
        document.getElementById('api-url').value = req.url;
        document.getElementById('api-body').value = req.body || '';
        if (req.token) document.getElementById('api-token').value = req.token;
        YDB.UI.toast('Request loaded', 'success');
    },

    /**
     * Delete a saved request
     */
    deleteRequest: function (id) {
        this.collections = this.collections.filter(function (r) { return r.id !== id; });
        this._save();
        this.renderCollections();
    },

    /**
     * Render collections sidebar
     */
    renderCollections: function () {
        var self = this;
        var el = document.getElementById('api-collections');

        // Built-in yDB API examples
        var builtIn = [
            { name: 'Login', method: 'POST', url: '/api/auth/login', body: '{"username":"admin","password":"your-password-here"}' },
            { name: 'My Profile', method: 'GET', url: '/api/auth/me', body: '' },
            { name: 'List Connections', method: 'GET', url: '/api/connections', body: '' },
            { name: 'Execute Query', method: 'POST', url: '/api/query/execute', body: '{"connectionId":2,"sql":"SELECT * FROM customers LIMIT 5"}' },
            { name: 'Get Schema', method: 'GET', url: '/api/explorer/2/schema', body: '' },
            { name: 'Pool Stats', method: 'GET', url: '/api/pool/stats', body: '' },
            { name: 'Metrics', method: 'GET', url: '/api/metrics', body: '' }
        ];

        var h = '<div class="mb-3"><div class="text-xs font-semibold text-base-content/60 mb-1">yDB API</div>';
        builtIn.forEach(function (req) {
            var methodCls = req.method === 'GET' ? 'text-success' : req.method === 'POST' ? 'text-warning' : 'text-info';
            h += '<div class="p-1.5 rounded cursor-pointer hover:bg-base-200 text-xs flex items-center gap-2" data-builtin-url="' + req.url + '" data-builtin-method="' + req.method + '" data-builtin-body="' + YDB.UI.esc(req.body) + '">';
            h += '<span class="font-mono font-bold ' + methodCls + ' w-10">' + req.method + '</span>';
            h += '<span class="truncate">' + req.name + '</span></div>';
        });
        h += '</div>';

        // User saved collections
        if (this.collections.length) {
            h += '<div class="mb-3"><div class="text-xs font-semibold text-base-content/60 mb-1">Saved</div>';
            this.collections.forEach(function (req) {
                var methodCls = req.method === 'GET' ? 'text-success' : req.method === 'POST' ? 'text-warning' : 'text-info';
                h += '<div class="p-1.5 rounded hover:bg-base-200 text-xs flex items-center gap-1">';
                h += '<span class="font-mono font-bold ' + methodCls + ' w-10 cursor-pointer" onclick="YDB.APIClient.loadRequest(' + req.id + ')">' + req.method + '</span>';
                h += '<span class="truncate flex-1 cursor-pointer" onclick="YDB.APIClient.loadRequest(' + req.id + ')">' + req.name + '</span>';
                h += '<button class="btn btn-ghost btn-xs text-error" onclick="YDB.APIClient.deleteRequest(' + req.id + ')">&times;</button></div>';
            });
            h += '</div>';
        }

        el.innerHTML = h;

        // Bind built-in clicks
        el.querySelectorAll('[data-builtin-url]').forEach(function (item) {
            item.addEventListener('click', function () {
                document.getElementById('api-method').value = this.dataset.builtinMethod;
                document.getElementById('api-url').value = window.location.origin + this.dataset.builtinUrl;
                document.getElementById('api-body').value = this.dataset.builtinBody || '';
                // Auto-apply yDB token
                if (YDB.API.token) document.getElementById('api-token').value = YDB.API.token;
            });
        });
    },

    /** @private Add a key-value row */
    _addRow: function (listId) {
        var list = document.getElementById(listId);
        var row = document.createElement('div');
        row.className = 'flex gap-1 mb-1';
        row.innerHTML = '<input class="input input-xs input-bordered flex-1" placeholder="Key"><input class="input input-xs input-bordered flex-1" placeholder="Value"><button class="btn btn-ghost btn-xs">&times;</button>';
        row.querySelector('button').addEventListener('click', function () { row.remove(); });
        list.appendChild(row);
    },

    _load: function () { var d = localStorage.getItem('ydb-api-collections'); this.collections = d ? JSON.parse(d) : []; },
    _save: function () { localStorage.setItem('ydb-api-collections', JSON.stringify(this.collections)); },

    aiGenerateTests: function () {
        var method = document.getElementById('api-method').value;
        var url = document.getElementById('api-url').value.trim();
        if (!url) { YDB.UI.toast('Enter a URL first', 'warning'); return; }

        YDB.UI.toast('Generating test cases...', 'info');
        YDB.API.post('/ai/api-test-generate', { method: method, url: url }).then(function (data) {
            var tests = data.tests || [];
            var el = document.getElementById('api-response');
            var h = 'Generated ' + tests.length + ' test cases:\n\n';
            tests.forEach(function (t, i) {
                h += '── Test ' + (i + 1) + ': ' + t.name + ' ──\n';
                h += t.method + ' ' + t.url + '\n';
                if (t.body) h += 'Body: ' + t.body + '\n';
                h += 'Expected: ' + t.expected + '\n\n';
            });
            el.textContent = h;
            document.getElementById('api-res-status').textContent = tests.length + ' tests';
            document.getElementById('api-res-status').className = 'badge badge-sm badge-success';
            YDB.UI.toast('Generated ' + tests.length + ' test cases', 'success');
        }).catch(function (err) { YDB.UI.toast('Failed: ' + err.message, 'error'); });
    }
};
