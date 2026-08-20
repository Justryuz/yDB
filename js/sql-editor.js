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

        var container = document.getElementById('sql-results');
        var conn = YDB.State.activeConnection;

        if (!conn) {
            container.innerHTML = '<div class="alert alert-warning text-sm m-2">Select a connection in the sidebar first</div>';
            return;
        }

        // Detect cross-DB query (has db_name.table patterns from multiple databases)
        var dbPrefixes = sql.match(/\b\w+\.\w+\.\w+/g); // matches db.table.column patterns
        if (dbPrefixes) {
            var uniqueDBs = [];
            dbPrefixes.forEach(function (p) {
                var db = p.split('.')[0];
                if (uniqueDBs.indexOf(db) < 0) uniqueDBs.push(db);
            });
            if (uniqueDBs.length > 1) {
                // Cross-DB detected but executing against single connection - warn and strip
                YDB.UI.toast('Cross-DB query detected. Executing against: ' + conn.name, 'info');
            }
        }

        // Use real API if online and connection selected
        if (YDB.API.isOnline() && YDB.API.token && conn && conn.id) {
            YDB.API.post('/query/execute', { connectionId: conn.id, sql: sql })
                .then(function (result) {
                    if (!result.data.length) { container.innerHTML = '<div class="alert alert-info text-sm m-2">0 rows returned</div>'; return; }
                    YDB.UI.renderTable('sql-results', result.columns, result.columns, result.data);
                    document.getElementById('sql-result-info').textContent = 'Results - ' + result.rowCount + ' rows (' + result.duration + 'ms)';
                    YDB.History.add(sql);
                    YDB.UI.toast('Executed: ' + result.rowCount + ' rows in ' + result.duration + 'ms', 'success');
                })
                .catch(function (err) {
                    container.innerHTML = '<div class="alert alert-error text-sm m-2">' + err.message + '</div>';
                });
        } else {
            // Fallback to mock query engine
            var result = YDB.QueryEngine.execute(sql);
            if (result.error) { container.innerHTML = '<div class="alert alert-error text-sm m-2">' + result.error + '</div>'; return; }
            if (!result.data.length) { container.innerHTML = '<div class="alert alert-info text-sm m-2">0 rows returned</div>'; return; }
            YDB.UI.renderTable('sql-results', result.columns, result.columns, result.data);
            document.getElementById('sql-result-info').textContent = 'Results - ' + result.data.length + ' rows';
            YDB.History.add(sql);
            YDB.Audit.log(sql);
            YDB.UI.toast('Executed: ' + result.data.length + ' rows', 'success');
        }
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
