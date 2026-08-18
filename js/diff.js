/**
 * YDB - Query Diff
 * Compare results of 2 queries side-by-side.
 */
YDB.Diff = {
    init: function () {
        var self = this;
        document.getElementById('btn-run-diff').addEventListener('click', function () { self.run(); });
    },

    open: function () {
        document.getElementById('modal-diff').showModal();
    },

    run: function () {
        var sqlA = document.getElementById('diff-sql-a').value.trim();
        var sqlB = document.getElementById('diff-sql-b').value.trim();

        if (!sqlA || !sqlB) { YDB.UI.toast('Enter both queries', 'warning'); return; }

        var resultA = YDB.QueryEngine.execute(sqlA);
        var resultB = YDB.QueryEngine.execute(sqlB);

        this._renderSide('diff-result-a', resultA, 'Query A');
        this._renderSide('diff-result-b', resultB, 'Query B');

        // Summary
        var countA = resultA.error ? 0 : resultA.data.length;
        var countB = resultB.error ? 0 : resultB.data.length;
        YDB.UI.toast('A: ' + countA + ' rows | B: ' + countB + ' rows', 'info');
    },

    _renderSide: function (containerId, result, label) {
        var el = document.getElementById(containerId);
        if (result.error) { el.innerHTML = '<div class="alert alert-error text-xs">' + result.error + '</div>'; return; }
        if (!result.data.length) { el.innerHTML = '<div class="text-xs text-base-content/50">0 rows</div>'; return; }

        var h = '<div class="text-xs font-semibold mb-1">' + label + ' (' + result.data.length + ' rows)</div>';
        h += '<table class="data-table"><thead><tr>';
        result.columns.forEach(function (c) { h += '<th>' + c + '</th>'; });
        h += '</tr></thead><tbody>';
        result.data.slice(0, 20).forEach(function (row) {
            h += '<tr>';
            result.columns.forEach(function (c) {
                var v = row[c];
                h += (v == null) ? '<td class="text-base-content/30">NULL</td>' : '<td>' + v + '</td>';
            });
            h += '</tr>';
        });
        h += '</tbody></table>';
        if (result.data.length > 20) h += '<div class="text-xs text-base-content/40 mt-1">Showing first 20 rows</div>';
        el.innerHTML = h;
    }
};
