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
        if (lower === 'help') {
            output.innerHTML += '<div class="text-base-content/60">Commands: help, clear, show tables, show databases, desc [table], use [connection], or any SQL query</div>';
        } else if (lower === 'clear') {
            this.clear(); return;
        } else if (lower === 'show tables') {
            var conn = YDB.State.activeConnection;
            if (!conn) { output.innerHTML += '<div class="text-error">No active connection. Use: use [connection_name]</div>'; }
            else {
                var schema = YDB.MockData.schemas[conn.id];
                if (schema) output.innerHTML += '<div>' + Object.keys(schema.tables).join('\n') + '</div>';
            }
        } else if (lower === 'show databases') {
            output.innerHTML += '<div>' + YDB.State.connections.map(function (c) { return c.name + ' (' + c.database + ')'; }).join('\n') + '</div>';
        } else if (lower.startsWith('desc ')) {
            var tn = lower.replace('desc ', '').trim();
            var conn2 = YDB.State.activeConnection;
            if (conn2) {
                var schema2 = YDB.MockData.schemas[conn2.id];
                if (schema2 && schema2.tables[tn]) {
                    var tbl = schema2.tables[tn];
                    var desc = tbl.columns.map(function (c) { return c.name.padEnd(20) + c.type.padEnd(15) + (c.key || '-'); }).join('\n');
                    output.innerHTML += '<div>' + desc + '</div>';
                } else { output.innerHTML += '<div class="text-error">Table not found: ' + tn + '</div>'; }
            }
        } else if (lower.startsWith('use ')) {
            var connName = cmd.replace(/^use\s+/i, '').trim();
            var found = YDB.State.connections.find(function (c) { return c.name.toLowerCase() === connName.toLowerCase(); });
            if (found) { YDB.Connections.select(found.id); output.innerHTML += '<div class="text-info">Switched to ' + found.name + '</div>'; }
            else { output.innerHTML += '<div class="text-error">Connection not found: ' + connName + '</div>'; }
        } else {
            // Execute SQL
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

        output.scrollTop = output.scrollHeight;
    },

    clear: function () { document.getElementById('terminal-output').innerHTML = '<div class="text-base-content/50">yDB Terminal v1.0 - Type "help" for commands</div>'; },

    _historyUp: function (input) { if (this.historyIdx > 0) { this.historyIdx--; input.value = this.history[this.historyIdx]; } },
    _historyDown: function (input) { if (this.historyIdx < this.history.length - 1) { this.historyIdx++; input.value = this.history[this.historyIdx]; } else { this.historyIdx = this.history.length; input.value = ''; } }
};
