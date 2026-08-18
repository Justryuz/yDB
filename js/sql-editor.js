/**
 * YDB - SQL Editor
 */
YDB.SQLEditor = {
    init: function () {
        var self = this;
        document.getElementById('btn-exec-sql').addEventListener('click', function () { self.execute(); });
        document.getElementById('btn-format-sql').addEventListener('click', function () { self.format(); });
        document.getElementById('btn-add-tab').addEventListener('click', function () { self.addTab(); });
        document.getElementById('sql-input').addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); self.execute(); }
        });

        // Export buttons
        document.querySelectorAll('[data-sexport]').forEach(function (btn) {
            btn.addEventListener('click', function () { YDB.Export.fromContainer('sql-results', this.dataset.sexport, 'query_result'); });
        });

        this._renderTabs();
    },

    execute: function () {
        var sql = document.getElementById('sql-input').value.trim();
        if (!sql) { YDB.UI.toast('Enter a query', 'warning'); return; }
        var result = YDB.QueryEngine.execute(sql);
        var container = document.getElementById('sql-results');
        if (result.error) { container.innerHTML = '<div class="alert alert-error text-sm m-2">' + result.error + '</div>'; return; }
        if (!result.data.length) { container.innerHTML = '<div class="alert alert-info text-sm m-2">0 rows returned</div>'; return; }
        YDB.UI.renderTable('sql-results', result.columns, result.columns, result.data);
        document.getElementById('sql-result-info').textContent = 'Results - ' + result.data.length + ' rows';
        YDB.History.add(sql);
        YDB.Audit.log(sql);
        YDB.UI.toast('Executed: ' + result.data.length + ' rows', 'success');
    },

    format: function () {
        var el = document.getElementById('sql-input');
        var sql = el.value.replace(/\s+/g, ' ').trim();
        sql = sql.replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|AND|OR|ORDER BY|GROUP BY|HAVING|LIMIT|INSERT|UPDATE|DELETE)\b/gi, function (m) { return '\n' + m.toUpperCase(); });
        sql = sql.replace(/,\s*/g, ',\n  ').trim();
        el.value = sql;
    },

    addTab: function () {
        var S = YDB.State;
        // Save current
        var cur = S.editorTabs.find(function (t) { return t.id === S.activeEditorTab; });
        if (cur) cur.content = document.getElementById('sql-input').value;
        S.editorTabCounter++;
        S.editorTabs.push({ id: S.editorTabCounter, name: 'Query ' + S.editorTabCounter, content: '' });
        S.activeEditorTab = S.editorTabCounter;
        document.getElementById('sql-input').value = '';
        this._renderTabs();
    },

    _switchTab: function (id) {
        var S = YDB.State;
        var cur = S.editorTabs.find(function (t) { return t.id === S.activeEditorTab; });
        if (cur) cur.content = document.getElementById('sql-input').value;
        S.activeEditorTab = id;
        var tab = S.editorTabs.find(function (t) { return t.id === id; });
        document.getElementById('sql-input').value = tab ? tab.content : '';
        this._renderTabs();
    },

    _renderTabs: function () {
        var S = YDB.State, self = this;
        var el = document.getElementById('editor-tabs');
        el.innerHTML = S.editorTabs.map(function (t) {
            return '<button class="tab tab-sm' + (t.id === S.activeEditorTab ? ' tab-active' : '') + '" data-etab="' + t.id + '">' + t.name + '</button>';
        }).join('');
        el.querySelectorAll('[data-etab]').forEach(function (btn) {
            btn.addEventListener('click', function () { self._switchTab(parseInt(this.dataset.etab)); });
        });
    }
};
