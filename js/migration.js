/**
 * YDB - Migration Builder
 * Compare 2 schemas and generate ALTER migration SQL.
 */
YDB.Migration = {
    init: function () {
        var self = this;
        document.getElementById('btn-gen-migration').addEventListener('click', function () { self.generate(); });
    },

    populateSelects: function () {
        var conns = YDB.State.connections.filter(function (c) { return YDB.MockData.schemas[c.id]; });
        var opts = '<option value="">Select...</option>' + conns.map(function (c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
        document.getElementById('migration-source').innerHTML = opts;
        document.getElementById('migration-target').innerHTML = opts;
    },

    generate: function () {
        var srcId = document.getElementById('migration-source').value;
        var tgtId = document.getElementById('migration-target').value;
        if (!srcId || !tgtId) { YDB.UI.toast('Select both source and target', 'warning'); return; }

        var src = YDB.MockData.schemas[srcId];
        var tgt = YDB.MockData.schemas[tgtId];
        var srcTables = Object.keys(src.tables);
        var tgtTables = Object.keys(tgt.tables);
        var sqls = [];

        // Tables in source but not target → CREATE
        srcTables.forEach(function (t) {
            if (tgtTables.indexOf(t) < 0) {
                sqls.push('-- Create table ' + t);
                var cols = src.tables[t].columns.map(function (c) {
                    return '  ' + c.name + ' ' + c.type + (c.key === 'PK' ? ' PRIMARY KEY' : '') + (!c.nullable ? ' NOT NULL' : '');
                });
                sqls.push('CREATE TABLE ' + t + ' (\n' + cols.join(',\n') + '\n);\n');
            }
        });

        // Tables in target but not source → DROP
        tgtTables.forEach(function (t) {
            if (srcTables.indexOf(t) < 0) {
                sqls.push('DROP TABLE IF EXISTS ' + t + ';\n');
            }
        });

        // Tables in both → compare columns
        srcTables.forEach(function (t) {
            if (tgtTables.indexOf(t) < 0) return;
            var srcCols = src.tables[t].columns;
            var tgtCols = tgt.tables[t].columns;
            var tgtNames = tgtCols.map(function (c) { return c.name; });
            var srcNames = srcCols.map(function (c) { return c.name; });

            srcCols.forEach(function (sc) {
                if (tgtNames.indexOf(sc.name) < 0) {
                    sqls.push('ALTER TABLE ' + t + ' ADD COLUMN ' + sc.name + ' ' + sc.type + ';');
                } else {
                    var tc = tgtCols.find(function (c) { return c.name === sc.name; });
                    if (tc && tc.type !== sc.type) {
                        sqls.push('ALTER TABLE ' + t + ' ALTER COLUMN ' + sc.name + ' TYPE ' + sc.type + ';');
                    }
                }
            });
            tgtCols.forEach(function (tc) {
                if (srcNames.indexOf(tc.name) < 0) {
                    sqls.push('ALTER TABLE ' + t + ' DROP COLUMN ' + tc.name + ';');
                }
            });
        });

        if (!sqls.length) sqls.push('-- No differences found. Schemas are identical.');

        document.getElementById('migration-output').textContent = sqls.join('\n');
        document.getElementById('migration-output').classList.remove('hidden');
        YDB.UI.toast('Migration SQL generated', 'success');
    }
};
