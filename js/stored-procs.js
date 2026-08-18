/**
 * YDB - Stored Procedures Manager
 * View, create, edit, execute stored procedures (mock).
 */
YDB.StoredProcs = {
    procedures: [],

    init: function () {
        this._load();
        var self = this;
        document.getElementById('btn-create-proc').addEventListener('click', function () { self.create(); });
    },

    _load: function () {
        var d = localStorage.getItem('ydb-procs');
        this.procedures = d ? JSON.parse(d) : [
            { id: 1, name: 'get_user_orders', params: 'user_id INT', body: 'SELECT o.* FROM orders o WHERE o.user_id = user_id;', connection: 'conn-1', created: '2024-03-01' },
            { id: 2, name: 'calculate_revenue', params: 'start_date DATE, end_date DATE', body: "SELECT SUM(total_amount) as revenue FROM orders WHERE created_at BETWEEN start_date AND end_date;", connection: 'conn-1', created: '2024-04-15' }
        ];
    },

    _save: function () { localStorage.setItem('ydb-procs', JSON.stringify(this.procedures)); },

    create: function () {
        var name = document.getElementById('proc-name').value.trim();
        var params = document.getElementById('proc-params').value.trim();
        var body = document.getElementById('proc-body').value.trim();
        if (!name || !body) { YDB.UI.toast('Fill name and body', 'warning'); return; }

        this.procedures.push({
            id: Date.now(), name: name, params: params, body: body,
            connection: YDB.State.activeConnection ? YDB.State.activeConnection.id : '',
            created: new Date().toISOString().split('T')[0]
        });
        this._save();
        this.render();
        document.getElementById('proc-name').value = '';
        document.getElementById('proc-params').value = '';
        document.getElementById('proc-body').value = '';
        YDB.UI.toast('Procedure created', 'success');
    },

    execute: function (id) {
        var proc = this.procedures.find(function (p) { return p.id === id; });
        if (!proc) return;
        document.getElementById('sql-input').value = '-- Execute: ' + proc.name + '\n' + proc.body;
        YDB.UI.switchTab('editor');
        YDB.UI.toast('Procedure loaded into editor', 'success');
    },

    remove: function (id) {
        if (!confirm('Delete procedure?')) return;
        this.procedures = this.procedures.filter(function (p) { return p.id !== id; });
        this._save(); this.render();
    },

    render: function () {
        var el = document.getElementById('procs-list');
        if (!this.procedures.length) { el.innerHTML = '<p class="text-base-content/40 text-center mt-8">No stored procedures</p>'; return; }

        el.innerHTML = this.procedures.map(function (p) {
            return '<div class="border border-base-300 rounded-lg p-3 mb-2">'
                + '<div class="flex items-center justify-between"><span class="font-semibold text-sm">' + p.name + '</span>'
                + '<div class="flex gap-1"><button class="btn btn-ghost btn-xs" onclick="YDB.StoredProcs.execute(' + p.id + ')"><i data-lucide="play" class="w-3 h-3"></i></button>'
                + '<button class="btn btn-ghost btn-xs text-error" onclick="YDB.StoredProcs.remove(' + p.id + ')"><i data-lucide="trash-2" class="w-3 h-3"></i></button></div></div>'
                + '<div class="text-xs text-base-content/50 mt-1">Params: ' + (p.params || 'none') + '</div>'
                + '<pre class="text-xs font-mono text-primary mt-2 bg-base-200 p-2 rounded">' + YDB.UI.esc(p.body) + '</pre></div>';
        }).join('');
        YDB.UI.icons();
    }
};
