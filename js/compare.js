/**
 * YDB - Compare Databases (Schema Diff)
 */
YDB.Compare = {
    init: function () {
        var self = this;
        document.getElementById('btn-compare').addEventListener('click', function () { self.run(); });
    },

    populateSelects: function () {
        var conns = YDB.State.connections.filter(function (c) { return YDB.MockData.schemas[c.id]; });
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
        el.innerHTML = h;
        YDB.UI.icons();
        YDB.UI.toast('Comparison complete', 'success');
    }
};
