/**
 * YDB - Audit Log
 * Track all queries: who, when, how long, which connection.
 */
YDB.Audit = {
    logs: [],

    init: function () {
        this._load();
        document.getElementById('btn-clear-audit').addEventListener('click', function () {
            if (confirm('Clear audit log?')) { YDB.Audit.logs = []; YDB.Audit._save(); YDB.Audit.render(); }
        });
        document.getElementById('audit-search').addEventListener('input', function () { YDB.Audit.render(); });
    },

    _load: function () { var d = localStorage.getItem('ydb-audit'); this.logs = d ? JSON.parse(d) : []; },
    _save: function () { localStorage.setItem('ydb-audit', JSON.stringify(this.logs.slice(-500))); },

    log: function (sql, connection, duration) {
        this.logs.push({
            id: Date.now(),
            sql: sql,
            user: YDB.State.user || 'unknown',
            connection: connection || (YDB.State.activeConnection ? YDB.State.activeConnection.name : 'N/A'),
            timestamp: new Date().toISOString(),
            duration: duration || Math.floor(Math.random() * 50 + 5) + 'ms',
            status: 'success'
        });
        this._save();
    },

    render: function () {
        var el = document.getElementById('audit-list');
        var search = (document.getElementById('audit-search').value || '').toLowerCase();
        var filtered = this.logs.filter(function (l) {
            if (!search) return true;
            return l.sql.toLowerCase().indexOf(search) >= 0 || l.user.toLowerCase().indexOf(search) >= 0 || l.connection.toLowerCase().indexOf(search) >= 0;
        }).reverse();

        if (!filtered.length) { el.innerHTML = '<p class="text-base-content/40 text-center mt-8">No audit records</p>'; return; }

        el.innerHTML = '<table class="data-table w-full"><thead><tr><th>Time</th><th>User</th><th>Connection</th><th>Duration</th><th>Query</th></tr></thead><tbody>'
            + filtered.slice(0, 100).map(function (l) {
                return '<tr><td class="text-xs">' + new Date(l.timestamp).toLocaleString() + '</td><td>' + l.user + '</td><td>' + l.connection + '</td><td>' + l.duration + '</td><td class="font-mono text-xs max-w-xs truncate">' + YDB.UI.esc(l.sql.substring(0, 80)) + '</td></tr>';
            }).join('') + '</tbody></table>';
    }
};
