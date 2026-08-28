/**
 * YDB - Compare Databases (Schema Diff)
 */
YDB.Compare = {
    init: function () {
        var self = this;
        document.getElementById('btn-compare').addEventListener('click', function () { self.run(); });
    },

    populateSelects: function () {
        var conns = YDB.State.connections;
        var opts = '<option value="">Select...</option>' + conns.map(function (c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
        document.getElementById('compare-left').innerHTML = opts;
        document.getElementById('compare-right').innerHTML = opts;
    },

    run: function () {
        var leftId = document.getElementById('compare-left').value;
        var rightId = document.getElementById('compare-right').value;
        if (!leftId || !rightId) { YDB.UI.toast('Select both connections', 'warning'); return; }
        if (leftId === rightId) { YDB.UI.toast('Select different connections', 'warning'); return; }

        var leftSchema = YDB.MockData.schemas[leftId];
        var rightSchema = YDB.MockData.schemas[rightId];
        if (!leftSchema || !leftSchema.tables) { YDB.UI.toast('Source schema not loaded. Click it in Explorer first.', 'warning'); return; }
        if (!rightSchema || !rightSchema.tables) { YDB.UI.toast('Target schema not loaded. Click it in Explorer first.', 'warning'); return; }
        var leftTables = Object.keys(leftSchema.tables);
        var rightTables = Object.keys(rightSchema.tables);

        var results = [];

        // Tables only in left
        leftTables.forEach(function (t) {
            if (rightTables.indexOf(t) < 0) {
                results.push({ table: t, status: 'only-left', detail: 'Only in source' });
            }
        });

        // Tables only in right
        rightTables.forEach(function (t) {
            if (leftTables.indexOf(t) < 0) {
                results.push({ table: t, status: 'only-right', detail: 'Only in target' });
            }
        });

        // Tables in both - compare columns
        leftTables.forEach(function (t) {
            if (rightTables.indexOf(t) < 0) return;
            var lCols = leftSchema.tables[t].columns;
            var rCols = rightSchema.tables[t].columns;

            var lNames = lCols.map(function (c) { return c.name; });
            var rNames = rCols.map(function (c) { return c.name; });

            var diffs = [];
            lCols.forEach(function (lc) {
                if (rNames.indexOf(lc.name) < 0) diffs.push('Column "' + lc.name + '" missing in target');
                else {
                    var rc = rCols.find(function (c) { return c.name === lc.name; });
                    if (rc.type !== lc.type) diffs.push(lc.name + ': type differs (' + lc.type + ' vs ' + rc.type + ')');
                }
            });
            rCols.forEach(function (rc) {
                if (lNames.indexOf(rc.name) < 0) diffs.push('Column "' + rc.name + '" extra in target');
            });

            if (diffs.length) results.push({ table: t, status: 'different', detail: diffs.join('; ') });
            else results.push({ table: t, status: 'identical', detail: 'Schemas match' });
        });

        this._render(results);
    },

    _render: function (results) {
        var el = document.getElementById('compare-results');
        var colors = { 'only-left': 'badge-error', 'only-right': 'badge-warning', 'different': 'badge-info', 'identical': 'badge-success' };
        var icons = { 'only-left': 'minus-circle', 'only-right': 'plus-circle', 'different': 'alert-triangle', 'identical': 'check-circle' };

        var h = '<div class="space-y-2">';
        results.forEach(function (r) {
            h += '<div class="flex items-start gap-3 p-3 border border-base-300 rounded-lg">';
            h += '<i data-lucide="' + icons[r.status] + '" class="w-5 h-5 shrink-0 mt-0.5"></i>';
            h += '<div class="flex-1 min-w-0">';
            h += '<div class="flex items-center gap-2"><span class="font-semibold text-sm">' + r.table + '</span><span class="badge badge-xs ' + colors[r.status] + '">' + r.status + '</span></div>';
            h += '<p class="text-xs text-base-content/60 mt-1">' + r.detail + '</p>';
            h += '</div></div>';
        });
        h += '</div>';
        h += '<div class="mt-3 text-xs text-base-content/50">' + results.length + ' tables compared</div>';

        // AI Migration SQL button
        var leftId = document.getElementById('compare-left').value;
        var rightId = document.getElementById('compare-right').value;
        var hasDiffs = results.some(function (r) { return r.status !== 'identical'; });
        if (hasDiffs && YDB.API.isOnline()) {
            h += '<button class="btn btn-primary btn-sm mt-3" onclick="YDB.Compare.generateMigration()">Generate Migration SQL</button>';
        }

        el.innerHTML = h;
        YDB.UI.icons();
        YDB.UI.toast('Comparison complete', 'success');
    },

    generateMigration: function () {
        var leftId = document.getElementById('compare-left').value;
        var rightId = document.getElementById('compare-right').value;
        if (!leftId || !rightId) return;

        YDB.UI.toast('Generating migration SQL...', 'info');
        YDB.API.post('/ai/schema-compare', { sourceConnectionId: parseInt(leftId), targetConnectionId: parseInt(rightId) }).then(function (result) {
            var el = document.getElementById('compare-results');
            var h = el.innerHTML;
            h += '<div class="mt-4 bg-base-200 rounded-lg p-4">';
            h += '<div class="font-semibold text-sm mb-2">Migration SQL (' + result.migrationSQL.length + ' statements)</div>';
            h += '<div class="text-xs text-base-content/70 mb-3">' + result.summary + '</div>';
            if (result.migrationSQL.length > 0) {
                h += '<pre class="bg-base-300 rounded p-3 text-xs font-mono text-success whitespace-pre-wrap max-h-64 overflow-auto">';
                h += result.migrationSQL.join('\n\n');
                h += '</pre>';
                h += '<button class="btn btn-sm btn-primary mt-2" onclick="document.getElementById(\'sql-input\').value=this.dataset.sql;YDB.UI.toast(\'Copied to SQL Editor\',\'success\');document.querySelector(\'[data-tab=editor]\').click()" data-sql="' + result.migrationSQL.join('\n').replace(/"/g, '&quot;') + '">Copy to SQL Editor</button>';
            } else {
                h += '<div class="text-success text-sm">Schemas are identical. No migration needed.</div>';
            }
            h += '</div>';
            el.innerHTML = h;
        }).catch(function (err) { YDB.UI.toast('Migration generation failed: ' + err.message, 'error'); });
    }
};
