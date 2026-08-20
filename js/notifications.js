/**
 * YDB - Notifications
 * Alert when scheduled queries detect anomalies.
 */
YDB.Notifications = {
    alerts: [],
    rules: [],

    init: function () {
        this._load();
        var self = this;
        document.getElementById('btn-add-alert-rule').addEventListener('click', function () { self.addRule(); });
        document.getElementById('btn-check-alerts').addEventListener('click', function () { self.checkAll(); });
    },

    _load: function () {
        var d = localStorage.getItem('ydb-alerts');
        this.alerts = d ? JSON.parse(d) : [];
        var r = localStorage.getItem('ydb-alert-rules');
        this.rules = r ? JSON.parse(r) : [
            { id: 1, name: 'Low stock alert', query: 'SELECT * FROM products', condition: 'rowCount < 3', connection: 'conn-1', active: true },
            { id: 2, name: 'New user spike', query: 'SELECT * FROM users', condition: 'rowCount > 20', connection: 'conn-1', active: true }
        ];
    },

    _save: function () {
        localStorage.setItem('ydb-alerts', JSON.stringify(this.alerts));
        localStorage.setItem('ydb-alert-rules', JSON.stringify(this.rules));
    },

    addRule: function () {
        var name = document.getElementById('alert-rule-name').value.trim();
        var query = document.getElementById('alert-rule-query').value.trim();
        var condition = document.getElementById('alert-rule-condition').value.trim();
        if (!name || !query || !condition) { YDB.UI.toast('Fill all fields', 'warning'); return; }

        this.rules.push({ id: Date.now(), name: name, query: query, condition: condition, connection: YDB.State.activeConnection ? YDB.State.activeConnection.id : '', active: true });
        this._save();
        this.render();
        document.getElementById('alert-rule-name').value = '';
        document.getElementById('alert-rule-query').value = '';
        document.getElementById('alert-rule-condition').value = '';
        YDB.UI.toast('Alert rule added', 'success');
    },

    checkAll: function () {
        var self = this;
        var triggered = 0;
        var conn = YDB.State.activeConnection;

        var checkRule = function (rule, callback) {
            if (!rule.active) { callback(); return; }

            if (YDB.API.isOnline() && YDB.API.token && conn) {
                YDB.API.post('/query/execute', { connectionId: conn.id, sql: rule.query })
                    .then(function (result) {
                        var rowCount = result.data ? result.data.length : 0;
                        self._evaluateRule(rule, rowCount);
                        callback();
                    }).catch(function () { callback(); });
            } else {
                var result = YDB.QueryEngine.execute(rule.query);
                if (!result.error) self._evaluateRule(rule, result.data.length);
                callback();
            }
        };

        // Process rules sequentially
        var idx = 0;
        var next = function () {
            if (idx >= self.rules.length) {
                self._save(); self.render();
                if (triggered) YDB.UI.toast(triggered + ' alert(s) triggered!', 'warning');
                else YDB.UI.toast('All checks passed', 'success');
                return;
            }
            checkRule(self.rules[idx], function () { idx++; next(); });
        };
        next();
    },

    _evaluateRule: function (rule, rowCount) {
        var condMet = false;
        try { condMet = eval(rule.condition.replace('rowCount', rowCount)); } catch (e) {}
        if (condMet) {
            this.alerts.unshift({ id: Date.now(), rule: rule.name, message: rule.condition + ' (got: ' + rowCount + ')', timestamp: new Date().toISOString(), read: false });
        }
    },

    getUnreadCount: function () { return this.alerts.filter(function (a) { return !a.read; }).length; },

    markAllRead: function () {
        this.alerts.forEach(function (a) { a.read = true; });
        this._save(); this.render();
    },

    render: function () {
        // Rules
        var rulesEl = document.getElementById('alert-rules-list');
        rulesEl.innerHTML = this.rules.map(function (r) {
            return '<div class="flex items-center gap-2 p-2 border border-base-300 rounded mb-1">'
                + '<input type="checkbox" class="checkbox checkbox-xs" ' + (r.active ? 'checked' : '') + ' onchange="YDB.Notifications.toggleRule(' + r.id + ')">'
                + '<div class="flex-1"><div class="text-xs font-semibold">' + r.name + '</div><div class="text-xs text-base-content/50">' + r.condition + '</div></div>'
                + '<button class="btn btn-ghost btn-xs text-error" onclick="YDB.Notifications.removeRule(' + r.id + ')"><i data-lucide="trash-2" class="w-3 h-3"></i></button></div>';
        }).join('');

        // Alerts
        var alertsEl = document.getElementById('alerts-list');
        if (!this.alerts.length) { alertsEl.innerHTML = '<p class="text-xs text-base-content/40 text-center">No alerts</p>'; }
        else {
            alertsEl.innerHTML = this.alerts.slice(0, 20).map(function (a) {
                var cls = a.read ? 'opacity-50' : '';
                return '<div class="flex items-center gap-2 p-2 border border-warning/30 rounded mb-1 ' + cls + '">'
                    + '<i data-lucide="alert-triangle" class="w-4 h-4 text-warning shrink-0"></i>'
                    + '<div class="flex-1"><div class="text-xs font-semibold">' + a.rule + '</div><div class="text-xs text-base-content/50">' + a.message + '</div></div>'
                    + '<span class="text-xs text-base-content/40">' + new Date(a.timestamp).toLocaleTimeString() + '</span></div>';
            }).join('');
        }
        YDB.UI.icons();
    },

    toggleRule: function (id) { var r = this.rules.find(function (x) { return x.id === id; }); if (r) { r.active = !r.active; this._save(); } },
    removeRule: function (id) { this.rules = this.rules.filter(function (x) { return x.id !== id; }); this._save(); this.render(); }
};
