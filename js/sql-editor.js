/**
 * YDB - SQL Editor
 */
YDB.SQLEditor = {
    init: function () {
        var self = this;
        document.getElementById('btn-exec-sql').addEventListener('click', function () { self.execute(); });
        document.getElementById('btn-format-sql').addEventListener('click', function () { self.format(); });
        document.getElementById('btn-ai-explain').addEventListener('click', function () { self.aiExplain(); });
        document.getElementById('btn-ai-optimize').addEventListener('click', function () { self.aiOptimize(); });
        document.getElementById('btn-ai-generate').addEventListener('click', function () { self.aiGenerate(); });
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
                    container.innerHTML = '<div class="bg-error/10 border border-error/30 rounded-lg p-3 m-2 text-sm">'
                        + '<div class="text-error font-medium mb-1">' + err.message + '</div>'
                        + '<button class="btn btn-sm btn-outline btn-primary mt-1" onclick="YDB.SQLEditor.aiFix(document.getElementById(\'sql-input\').value, \'' + err.message.replace(/'/g, "\\'") + '\')"><i data-lucide="sparkles" class="w-3 h-3"></i> AI Fix</button>'
                        + '</div>';
                    YDB.UI.icons();
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
    },

    // ── AI SQL Assistant ──

    aiExplain: function () {
        var sql = document.getElementById('sql-input').value.trim();
        if (!sql) { YDB.UI.toast('Enter SQL to explain', 'warning'); return; }
        var conn = YDB.State.activeConnection;
        var connId = conn ? conn.id : null;

        YDB.UI.toast('AI analyzing query...', 'info');
        YDB.API.post('/ai/sql-explain', { connectionId: connId, sql: sql }).then(function (result) {
            var el = document.getElementById('sql-results');
            el.innerHTML = '<div class="bg-base-200 rounded-lg p-4 m-2 text-sm">'
                + '<div class="font-semibold text-primary mb-2">AI Explanation</div>'
                + '<div class="text-base-content/90">' + (result.explanation || 'No explanation available.') + '</div>'
                + '</div>';
        }).catch(function (err) { YDB.UI.toast('AI error: ' + err.message, 'error'); });
    },

    aiOptimize: function () {
        var sql = document.getElementById('sql-input').value.trim();
        if (!sql) { YDB.UI.toast('Enter SQL to optimize', 'warning'); return; }
        var conn = YDB.State.activeConnection;
        var connId = conn ? conn.id : null;

        YDB.UI.toast('AI optimizing query...', 'info');
        YDB.API.post('/ai/sql-optimize', { connectionId: connId, sql: sql }).then(function (result) {
            var el = document.getElementById('sql-results');
            var h = '<div class="bg-base-200 rounded-lg p-4 m-2 text-sm">';
            h += '<div class="font-semibold text-primary mb-2">AI Optimization</div>';
            if (result.sql && result.sql !== sql) {
                h += '<div class="text-xs text-base-content/60 mb-1">Optimized SQL:</div>';
                h += '<pre class="bg-base-300 rounded p-2 text-xs font-mono text-success mb-2 whitespace-pre-wrap">' + result.sql + '</pre>';
                h += '<button class="btn btn-primary btn-xs mb-2" onclick="document.getElementById(\'sql-input\').value=this.dataset.sql;YDB.UI.toast(\'Applied\',\'success\')" data-sql="' + result.sql.replace(/"/g, '&quot;') + '">Apply Optimized SQL</button>';
            }
            h += '<div class="text-base-content/90">' + (result.explanation || '') + '</div>';
            if (result.suggestions && result.suggestions.length) {
                h += '<div class="mt-2 text-xs text-base-content/60">';
                result.suggestions.forEach(function (s) { h += '<div>- ' + s + '</div>'; });
                h += '</div>';
            }
            h += '</div>';
            el.innerHTML = h;
        }).catch(function (err) { YDB.UI.toast('AI error: ' + err.message, 'error'); });
    },

    aiGenerate: function () {
        var description = prompt('Describe what you want to query:');
        if (!description) return;
        var conn = YDB.State.activeConnection;
        var connId = conn ? conn.id : null;

        YDB.UI.toast('AI generating SQL...', 'info');
        YDB.API.post('/ai/sql-generate', { connectionId: connId, description: description }).then(function (result) {
            if (result.sql) {
                document.getElementById('sql-input').value = result.sql;
                YDB.UI.toast('SQL generated!', 'success');
                var el = document.getElementById('sql-results');
                el.innerHTML = '<div class="bg-base-200 rounded-lg p-3 m-2 text-sm text-base-content/70">' + (result.explanation || '') + '</div>';
            } else {
                YDB.UI.toast('Could not generate SQL. Try rephrasing.', 'warning');
            }
        }).catch(function (err) { YDB.UI.toast('AI error: ' + err.message, 'error'); });
    },

    aiFix: function (sql, error) {
        var conn = YDB.State.activeConnection;
        var connId = conn ? conn.id : null;

        YDB.API.post('/ai/sql-fix', { connectionId: connId, sql: sql, error: error }).then(function (result) {
            var el = document.getElementById('sql-results');
            var h = '<div class="bg-base-200 rounded-lg p-4 m-2 text-sm">';
            h += '<div class="font-semibold text-primary mb-2">AI Fix Suggestion</div>';
            h += '<div class="text-base-content/90 mb-2">' + (result.explanation || '') + '</div>';
            if (result.sql && result.sql !== sql) {
                h += '<pre class="bg-base-300 rounded p-2 text-xs font-mono text-success mb-2 whitespace-pre-wrap">' + result.sql + '</pre>';
                h += '<button class="btn btn-primary btn-xs" onclick="document.getElementById(\'sql-input\').value=this.dataset.sql;YDB.UI.toast(\'Applied\',\'success\')" data-sql="' + result.sql.replace(/"/g, '&quot;') + '">Apply Fix</button>';
            }
            h += '</div>';
            el.innerHTML = h;
        }).catch(function (err) { YDB.UI.toast('AI fix unavailable', 'error'); });
    }
};
