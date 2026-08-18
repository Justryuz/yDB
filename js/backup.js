/**
 * YDB - Backup/Restore
 * Export full schema + data as SQL dump, restore from file.
 */
YDB.Backup = {
    init: function () {
        var self = this;
        document.getElementById('btn-backup').addEventListener('click', function () { self.exportDump(); });
        document.getElementById('btn-restore').addEventListener('click', function () { document.getElementById('restore-file').click(); });
        document.getElementById('restore-file').addEventListener('change', function () { if (this.files.length) self.importDump(this.files[0]); });
    },

    exportDump: function () {
        var conn = YDB.State.activeConnection;
        if (!conn) { YDB.UI.toast('Select a connection first', 'warning'); return; }
        var schema = YDB.MockData.schemas[conn.id];
        if (!schema) return;

        var lines = [];
        lines.push('-- yDB Backup');
        lines.push('-- Connection: ' + conn.name);
        lines.push('-- Database: ' + schema.name);
        lines.push('-- Date: ' + new Date().toISOString());
        lines.push('-- ==============================\n');

        Object.keys(schema.tables).forEach(function (tn) {
            var table = schema.tables[tn];
            // CREATE TABLE
            lines.push('DROP TABLE IF EXISTS ' + tn + ';');
            var colDefs = table.columns.map(function (c) {
                return '  ' + c.name + ' ' + c.type + (c.key === 'PK' ? ' PRIMARY KEY' : '') + (!c.nullable ? ' NOT NULL' : '');
            });
            lines.push('CREATE TABLE ' + tn + ' (\n' + colDefs.join(',\n') + '\n);\n');

            // INSERT DATA
            if (table.data.length) {
                var cols = table.columns.map(function (c) { return c.name; });
                table.data.forEach(function (row) {
                    var vals = cols.map(function (c) {
                        var v = row[c];
                        if (v === null || v === undefined) return 'NULL';
                        if (typeof v === 'number') return v;
                        return "'" + String(v).replace(/'/g, "''") + "'";
                    });
                    lines.push('INSERT INTO ' + tn + ' (' + cols.join(', ') + ') VALUES (' + vals.join(', ') + ');');
                });
                lines.push('');
            }
        });

        var content = lines.join('\n');
        var blob = new Blob([content], { type: 'text/sql' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = schema.name + '_backup_' + new Date().toISOString().split('T')[0] + '.sql';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        YDB.UI.toast('Backup exported as SQL dump', 'success');
    },

    importDump: function (file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var content = e.target.result;
            // Just show the content in SQL editor for now
            document.getElementById('sql-input').value = content;
            YDB.UI.switchTab('editor');
            YDB.UI.toast('Backup loaded into SQL Editor (' + (content.length / 1024).toFixed(1) + ' KB)', 'success');
        };
        reader.readAsText(file);
        document.getElementById('restore-file').value = '';
    }
};
