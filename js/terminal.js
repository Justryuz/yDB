/**
 * YDB - Terminal/Console
 * Raw SQL CLI in browser.
 */
YDB.Terminal = {
    history: [],
    historyIdx: -1,

    init: function () {
        var self = this;
        document.getElementById('terminal-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); self.execute(this.value); this.value = ''; }
            else if (e.key === 'ArrowUp') { e.preventDefault(); self._historyUp(this); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); self._historyDown(this); }
        });
        document.getElementById('btn-terminal-clear').addEventListener('click', function () { self.clear(); });
    },

    execute: function (cmd) {
        if (!cmd.trim()) return;
        this.history.push(cmd);
        this.historyIdx = this.history.length;

        var output = document.getElementById('terminal-output');
        output.innerHTML += '<div class="text-success">ydb&gt; ' + YDB.UI.esc(cmd) + '</div>';

        // Special commands
        var lower = cmd.trim().toLowerCase();
        if (lower === 'help' || lower === '/help') {
            output.innerHTML += '<div class="text-base-content/80 whitespace-pre-wrap">'
                + '╔══════════════════════════════════════════════════════════╗\n'
                + '║              yDB Terminal - Command Reference            ║\n'
                + '╠══════════════════════════════════════════════════════════╣\n'
                + '║                                                          ║\n'
                + '║  <span class="text-success">/help</span>                  Show this help message        ║\n'
                + '║  <span class="text-success">/status</span>                Show connection status        ║\n'
                + '║  <span class="text-success">/connections</span>            List all connections          ║\n'
                + '║  <span class="text-success">/schema</span>                Show current DB schema        ║\n'
                + '║  <span class="text-success">/tables</span>                List tables in current DB     ║\n'
                + '║  <span class="text-success">/desc [table]</span>           Describe table columns       ║\n'
                + '║  <span class="text-success">/use [connection]</span>       Switch active connection     ║\n'
                + '║  <span class="text-success">/ask [question]</span>         Ask Copilot (natural lang)   ║\n'
                + '║  <span class="text-success">/export csv</span>             Export last result as CSV     ║\n'
                + '║  <span class="text-success">/clear</span>                 Clear terminal output         ║\n'
                + '║  <span class="text-success">/history</span>               Show command history          ║\n'
                + '║                                                          ║\n'
                + '║  Or type any SQL query directly:                         ║\n'
                + '║  <span class="text-info">SELECT * FROM users LIMIT 10</span>                     ║\n'
                + '║  <span class="text-info">SELECT COUNT(*) FROM orders WHERE status=\'paid\'</span> ║\n'
                + '║                                                          ║\n'
                + '║  Shortcuts:                                              ║\n'
                + '║  <span class="text-warning">Arrow Up/Down</span>  Navigate command history           ║\n'
                + '║  <span class="text-warning">Enter</span>          Execute command                     ║\n'
                + '╚══════════════════════════════════════════════════════════╝</div>';
        } else if (lower === '/status') {
            var conn = YDB.State.activeConnection;
            if (conn) {
                output.innerHTML += '<div class="text-info">Active: ' + conn.name + ' (' + (conn.type || conn.db_type) + ') @ ' + conn.host + '</div>';
                output.innerHTML += '<div class="text-base-content/60">Database: ' + (conn.database || conn.database_name || 'N/A') + '</div>';
                output.innerHTML += '<div class="text-base-content/60">API: ' + (YDB.API.isOnline() ? 'Online' : 'Offline') + '</div>';
            } else {
                output.innerHTML += '<div class="text-warning">No active connection. Use /connections to see available, /use [name] to connect.</div>';
            }
        } else if (lower === '/connections') {
            var conns = YDB.State.connections;
            if (conns.length === 0) {
                output.innerHTML += '<div class="text-warning">No connections configured. Click + in sidebar to add one.</div>';
            } else {
                var h = '<div class="text-base-content/80">';
                conns.forEach(function (c, i) {
                    var active = YDB.State.activeConnection && YDB.State.activeConnection.id === c.id;
                    h += (active ? '<span class="text-success">* </span>' : '  ') + (i + 1) + '. ' + c.name + ' <span class="text-base-content/50">(' + (c.type || '') + ' @ ' + (c.host || '') + ')</span>\n';
                });
                h += '</div>';
                output.innerHTML += h;
            }
        } else if (lower === '/tables' || lower === 'show tables') {
            var conn = YDB.State.activeConnection;
            if (!conn) { output.innerHTML += '<div class="text-error">No active connection.</div>'; }
            else if (YDB.API.isOnline() && YDB.API.token) {
                YDB.API.get('/explorer/' + conn.id + '/schema').then(function (schema) {
                    var tables = Object.keys(schema.tables || {});
                    output.innerHTML += '<div class="text-base-content/80">' + tables.length + ' tables:\n' + tables.map(function (t) { return '  ' + t; }).join('\n') + '</div>';
                    output.scrollTop = output.scrollHeight;
                }).catch(function (err) { output.innerHTML += '<div class="text-error">' + err.message + '</div>'; });
            } else {
                var schema = YDB.MockData.schemas[conn.id];
                if (schema) output.innerHTML += '<div>' + Object.keys(schema.tables).join('\n') + '</div>';
            }
        } else if (lower === '/schema') {
            var conn = YDB.State.activeConnection;
            if (!conn) { output.innerHTML += '<div class="text-error">No active connection.</div>'; }
            else if (YDB.API.isOnline() && YDB.API.token) {
                YDB.API.get('/explorer/' + conn.id + '/schema').then(function (schema) {
                    var h = '<div class="text-base-content/80">';
                    for (var t in schema.tables) {
                        var cols = schema.tables[t].columns || [];
                        h += '\n<span class="text-info">' + t + '</span> (' + cols.length + ' columns)\n';
                        cols.forEach(function (c) {
                            var name = c.name || c;
                            var type = c.type || '';
                            var key = c.key ? ' [' + c.key + ']' : '';
                            h += '  ' + name + ' <span class="text-base-content/50">' + type + key + '</span>\n';
                        });
                    }
                    h += '</div>';
                    output.innerHTML += h;
                    output.scrollTop = output.scrollHeight;
                }).catch(function (err) { output.innerHTML += '<div class="text-error">' + err.message + '</div>'; });
            }
        } else if (lower === '/history') {
            if (this.history.length === 0) {
                output.innerHTML += '<div class="text-base-content/50">No command history.</div>';
            } else {
                output.innerHTML += '<div class="text-base-content/80">' + this.history.map(function (h, i) { return (i + 1) + '. ' + h; }).join('\n') + '</div>';
            }
        } else if (lower.startsWith('/ask ')) {
            var question = cmd.replace(/^\/ask\s+/i, '').trim();
            var conn = YDB.State.activeConnection;
            if (!conn) { output.innerHTML += '<div class="text-error">No active connection. Use /use [name] first.</div>'; }
            else if (YDB.API.isOnline() && YDB.API.token) {
                output.innerHTML += '<div class="text-base-content/50">Analyzing: "' + question + '"...</div>';
                YDB.API.post('/nlq/ask', { connectionId: conn.id, question: question }).then(function (result) {
                    if (result.sql) output.innerHTML += '<div class="text-info">SQL: ' + result.sql + '</div>';
                    output.innerHTML += '<div class="text-base-content/80">' + result.explanation + '</div>';
                    if (result.data && result.data.length > 0 && result.chartType === 'number') {
                        output.innerHTML += '<div class="text-success text-lg font-bold">' + Object.values(result.data[0])[0] + '</div>';
                    } else if (result.data && result.data.length > 0) {
                        var h = '<table class="data-table my-1"><thead><tr>' + result.columns.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
                        result.data.slice(0, 10).forEach(function (row) {
                            h += '<tr>' + result.columns.map(function (c) { var v = row[c]; return '<td>' + (v == null ? 'NULL' : v) + '</td>'; }).join('') + '</tr>';
                        });
                        h += '</tbody></table>';
                        output.innerHTML += h;
                    }
                    if (result.error) output.innerHTML += '<div class="text-error">' + result.error + '</div>';
                    output.scrollTop = output.scrollHeight;
                }).catch(function (err) { output.innerHTML += '<div class="text-error">' + err.message + '</div>'; output.scrollTop = output.scrollHeight; });
            }
        } else if (lower === 'clear' || lower === '/clear') {
            this.clear(); return;
        } else if (lower === 'show databases' || lower === '/databases') {
            output.innerHTML += '<div>' + YDB.State.connections.map(function (c) { return c.name + ' (' + c.database + ')'; }).join('\n') + '</div>';
        } else if (lower.startsWith('desc ') || lower.startsWith('/desc ')) {
            var tn = lower.replace(/^\/?desc\s+/, '').trim();
            var conn2 = YDB.State.activeConnection;
            if (!conn2) { output.innerHTML += '<div class="text-error">No active connection.</div>'; }
            else if (YDB.API.isOnline() && YDB.API.token) {
                YDB.API.get('/explorer/' + conn2.id + '/schema').then(function (schema) {
                    var table = schema.tables[tn];
                    if (!table) { output.innerHTML += '<div class="text-error">Table not found: ' + tn + '</div>'; return; }
                    var cols = table.columns || [];
                    var h = '<div class="text-base-content/80"><span class="text-info">' + tn + '</span> (' + cols.length + ' columns)\n';
                    cols.forEach(function (c) { h += '  ' + (c.name || c).padEnd(25) + (c.type || '').padEnd(15) + (c.key || '') + '\n'; });
                    h += '</div>';
                    output.innerHTML += h;
                    output.scrollTop = output.scrollHeight;
                }).catch(function (err) { output.innerHTML += '<div class="text-error">' + err.message + '</div>'; });
            } else {
                var schema2 = YDB.MockData.schemas[conn2.id];
                if (schema2 && schema2.tables[tn]) {
                    var tbl = schema2.tables[tn];
                    var desc = tbl.columns.map(function (c) { return c.name.padEnd(20) + c.type.padEnd(15) + (c.key || '-'); }).join('\n');
                    output.innerHTML += '<div>' + desc + '</div>';
                } else { output.innerHTML += '<div class="text-error">Table not found: ' + tn + '</div>'; }
            }
        } else if (lower.startsWith('use ') || lower.startsWith('/use ')) {
            var connName = cmd.replace(/^\/?use\s+/i, '').trim();
            var found = YDB.State.connections.find(function (c) { return c.name.toLowerCase() === connName.toLowerCase(); });
            if (found) { YDB.Connections.select(found.id); output.innerHTML += '<div class="text-info">Switched to ' + found.name + '</div>'; }
            else { output.innerHTML += '<div class="text-error">Connection not found: ' + connName + '</div>'; }
        } else {
            // Execute SQL
            var conn = YDB.State.activeConnection;
            if (YDB.API.isOnline() && YDB.API.token && conn) {
                YDB.API.post('/query/execute', { connectionId: conn.id, sql: cmd })
                    .then(function (result) {
                        var h = '<table class="data-table my-1"><thead><tr>' + result.columns.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
                        result.data.slice(0, 20).forEach(function (row) {
                            h += '<tr>' + result.columns.map(function (c) { var v = row[c]; return '<td>' + (v == null ? 'NULL' : v) + '</td>'; }).join('') + '</tr>';
                        });
                        h += '</tbody></table><div class="text-xs text-base-content/50">' + result.data.length + ' rows</div>';
                        output.innerHTML += h;
                        output.scrollTop = output.scrollHeight;
                    })
                    .catch(function (err) { output.innerHTML += '<div class="text-error">' + err.message + '</div>'; output.scrollTop = output.scrollHeight; });
            } else {
                var result = YDB.QueryEngine.execute(cmd);
                if (result.error) { output.innerHTML += '<div class="text-error">' + result.error + '</div>'; }
                else {
                    var h = '<table class="data-table my-1"><thead><tr>' + result.columns.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
                    result.data.slice(0, 20).forEach(function (row) {
                        h += '<tr>' + result.columns.map(function (c) { var v = row[c]; return '<td>' + (v == null ? 'NULL' : v) + '</td>'; }).join('') + '</tr>';
                    });
                    h += '</tbody></table><div class="text-xs text-base-content/50">' + result.data.length + ' rows</div>';
                    output.innerHTML += h;
                    YDB.Audit.log(cmd);
                }
            }
        }

        output.scrollTop = output.scrollHeight;
    },

    clear: function () { document.getElementById('terminal-output').innerHTML = '<div class="text-base-content/50">yDB Terminal v2.0 — Type /help for commands, or enter SQL directly.</div>'; },

    _historyUp: function (input) { if (this.historyIdx > 0) { this.historyIdx--; input.value = this.history[this.historyIdx]; } },
    _historyDown: function (input) { if (this.historyIdx < this.history.length - 1) { this.historyIdx++; input.value = this.history[this.historyIdx]; } else { this.historyIdx = this.history.length; input.value = ''; } }
};
