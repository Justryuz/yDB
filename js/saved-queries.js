/**
 * YDB - Saved Queries / Snippets
 */
YDB.SavedQueries = {
    init: function () {
        var self = this;
        document.getElementById('btn-save-query').addEventListener('click', function () { self.openSaveModal(); });
        document.getElementById('btn-confirm-save-query').addEventListener('click', function () { self.save(); });
    },

    _getAll: function () {
        var d = localStorage.getItem('ydb-saved-queries');
        return d ? JSON.parse(d) : [];
    },

    _saveAll: function (queries) {
        localStorage.setItem('ydb-saved-queries', JSON.stringify(queries));
    },

    openSaveModal: function () {
        var sql = document.getElementById('sql-input').value.trim();
        if (!sql) { YDB.UI.toast('Write a query in SQL Editor first', 'warning'); return; }
        document.getElementById('sq-sql').value = sql;
        document.getElementById('sq-name').value = '';
        document.getElementById('sq-folder').value = 'General';
        document.getElementById('modal-save-query').showModal();
    },

    save: function () {
        var name = document.getElementById('sq-name').value.trim();
        var folder = document.getElementById('sq-folder').value.trim() || 'General';
        var sql = document.getElementById('sq-sql').value;
        if (!name) { YDB.UI.toast('Enter a name', 'warning'); return; }

        var all = this._getAll();
        all.push({ id: Date.now(), name: name, folder: folder, sql: sql, created: new Date().toISOString() });
        this._saveAll(all);
        document.getElementById('modal-save-query').close();
        this.render();
        YDB.UI.toast('Query saved!', 'success');
    },

    render: function () {
        var all = this._getAll();
        var el = document.getElementById('saved-list');
        if (!all.length) { el.innerHTML = '<p class="text-base-content/40 text-center mt-10">No saved queries yet</p>'; return; }

        // Group by folder
        var folders = {};
        all.forEach(function (q) { if (!folders[q.folder]) folders[q.folder] = []; folders[q.folder].push(q); });

        var h = '';
        Object.keys(folders).forEach(function (folder) {
            h += '<div class="mb-4">';
            h += '<div class="flex items-center gap-2 mb-2"><i data-lucide="folder" class="w-4 h-4 text-warning"></i><span class="text-sm font-semibold">' + folder + '</span></div>';
            folders[folder].forEach(function (q) {
                h += '<div class="history-item">';
                h += '<div class="flex items-center justify-between mb-1">';
                h += '<span class="text-sm font-medium">' + YDB.UI.esc(q.name) + '</span>';
                h += '<div class="flex gap-1">';
                h += '<button class="btn btn-ghost btn-xs" data-load-q="' + q.id + '"><i data-lucide="play" class="w-3 h-3"></i>Load</button>';
                h += '<button class="btn btn-ghost btn-xs text-error" data-del-q="' + q.id + '"><i data-lucide="trash-2" class="w-3 h-3"></i></button>';
                h += '</div></div>';
                h += '<div class="hql">' + YDB.UI.esc(q.sql) + '</div>';
                h += '<div class="text-xs text-base-content/40 mt-1">' + new Date(q.created).toLocaleDateString() + '</div>';
                h += '</div>';
            });
            h += '</div>';
        });
        el.innerHTML = h;
        YDB.UI.icons();

        // Bind
        el.querySelectorAll('[data-load-q]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var q = YDB.SavedQueries._getAll().find(function (x) { return x.id === parseInt(btn.dataset.loadQ); });
                if (q) { document.getElementById('sql-input').value = q.sql; YDB.UI.switchTab('editor'); YDB.UI.toast('Query loaded', 'success'); }
            });
        });
        el.querySelectorAll('[data-del-q]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (!confirm('Delete this query?')) return;
                var all = YDB.SavedQueries._getAll().filter(function (x) { return x.id !== parseInt(btn.dataset.delQ); });
                YDB.SavedQueries._saveAll(all);
                YDB.SavedQueries.render();
                YDB.UI.toast('Deleted', 'info');
            });
        });
    }
};
