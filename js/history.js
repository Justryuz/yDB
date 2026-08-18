/**
 * YDB - Query History
 */
YDB.History = {
    init: function () {
        var self = this;
        document.getElementById('history-search').addEventListener('input', function () { self.render(); });
        document.getElementById('btn-clear-history').addEventListener('click', function () { self.clear(); });
    },

    add: function (sql) {
        YDB.State.queryHistory.unshift({
            id: Date.now(),
            sql: sql,
            timestamp: new Date().toISOString(),
            connection: YDB.State.activeConnection ? YDB.State.activeConnection.name : 'N/A'
        });
        if (YDB.State.queryHistory.length > 200) YDB.State.queryHistory.pop();
        YDB.State.save();
        this.render();
    },

    render: function () {
        var el = document.getElementById('history-list');
        var search = (document.getElementById('history-search').value || '').toLowerCase();
        var filtered = YDB.State.queryHistory.filter(function (h) {
            if (!search) return true;
            return h.sql.toLowerCase().indexOf(search) >= 0 || h.connection.toLowerCase().indexOf(search) >= 0;
        });

        if (!filtered.length) { el.innerHTML = '<p class="text-base-content/40 text-center mt-10">No queries found</p>'; return; }

        el.innerHTML = filtered.map(function (entry) {
            var time = new Date(entry.timestamp).toLocaleString();
            return '<div class="history-item">'
                + '<div class="flex items-center justify-between mb-1">'
                + '<span class="text-xs text-base-content/50">' + time + ' - ' + entry.connection + '</span>'
                + '<button class="btn btn-ghost btn-xs" data-rerun="' + entry.id + '"><i data-lucide="play" class="w-3 h-3"></i>Run</button>'
                + '</div><div class="hql">' + YDB.UI.esc(entry.sql) + '</div></div>';
        }).join('');
        YDB.UI.icons();

        el.querySelectorAll('[data-rerun]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = parseInt(this.dataset.rerun);
                var entry = YDB.State.queryHistory.find(function (h) { return h.id === id; });
                if (entry) {
                    document.getElementById('sql-input').value = entry.sql;
                    YDB.UI.switchTab('editor');
                    YDB.SQLEditor.execute();
                }
            });
        });
    },

    clear: function () {
        if (!confirm('Clear all history?')) return;
        YDB.State.queryHistory = [];
        YDB.State.save();
        this.render();
        YDB.UI.toast('History cleared', 'info');
    }
};
