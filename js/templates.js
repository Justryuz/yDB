/**
 * YDB - Query Templates
 * Pre-built query patterns with fillable parameters.
 */
YDB.Templates = {
    library: [
        { id: 'top-n', name: 'Top N Records', category: 'Common', sql: 'SELECT * FROM {{table}} ORDER BY {{column}} DESC LIMIT {{limit}}', params: ['table', 'column', 'limit'] },
        { id: 'duplicates', name: 'Find Duplicates', category: 'Common', sql: 'SELECT {{column}}, COUNT(*) as cnt FROM {{table}} GROUP BY {{column}} HAVING COUNT(*) > 1', params: ['table', 'column'] },
        { id: 'count-by', name: 'Count by Group', category: 'Aggregation', sql: 'SELECT {{group_column}}, COUNT(*) as total FROM {{table}} GROUP BY {{group_column}} ORDER BY total DESC', params: ['table', 'group_column'] },
        { id: 'sum-by', name: 'Sum by Group', category: 'Aggregation', sql: 'SELECT {{group_column}}, SUM({{value_column}}) as total FROM {{table}} GROUP BY {{group_column}}', params: ['table', 'group_column', 'value_column'] },
        { id: 'date-range', name: 'Filter by Date Range', category: 'Filtering', sql: "SELECT * FROM {{table}} WHERE {{date_column}} BETWEEN '{{start_date}}' AND '{{end_date}}'", params: ['table', 'date_column', 'start_date', 'end_date'] },
        { id: 'search', name: 'Search Text', category: 'Filtering', sql: "SELECT * FROM {{table}} WHERE {{column}} LIKE '%{{search_term}}%'", params: ['table', 'column', 'search_term'] },
        { id: 'null-check', name: 'Find NULL Values', category: 'Data Quality', sql: 'SELECT * FROM {{table}} WHERE {{column}} IS NULL', params: ['table', 'column'] },
        { id: 'distinct', name: 'Distinct Values', category: 'Common', sql: 'SELECT DISTINCT {{column}} FROM {{table}} ORDER BY {{column}}', params: ['table', 'column'] },
        { id: 'row-count', name: 'Table Row Counts', category: 'Admin', sql: 'SELECT COUNT(*) as row_count FROM {{table}}', params: ['table'] },
        { id: 'join-basic', name: 'Basic Join', category: 'Joins', sql: 'SELECT a.*, b.* FROM {{table_a}} a INNER JOIN {{table_b}} b ON a.{{join_col_a}} = b.{{join_col_b}}', params: ['table_a', 'table_b', 'join_col_a', 'join_col_b'] }
    ],

    init: function () {
        var self = this;
        document.getElementById('btn-use-template').addEventListener('click', function () { self.applyTemplate(); });
    },

    render: function () {
        var el = document.getElementById('templates-list');
        var categories = {};
        this.library.forEach(function (t) { if (!categories[t.category]) categories[t.category] = []; categories[t.category].push(t); });

        var h = '';
        Object.keys(categories).forEach(function (cat) {
            h += '<div class="mb-4"><div class="text-xs font-semibold text-base-content/60 mb-1">' + cat + '</div>';
            categories[cat].forEach(function (t) {
                h += '<div class="p-2 border border-base-300 rounded mb-1 cursor-pointer hover:border-primary transition" data-tpl="' + t.id + '">';
                h += '<div class="text-sm font-medium">' + t.name + '</div>';
                h += '<div class="text-xs text-base-content/40 font-mono mt-1">' + t.sql.substring(0, 60) + '...</div>';
                h += '</div>';
            });
            h += '</div>';
        });
        el.innerHTML = h;

        el.querySelectorAll('[data-tpl]').forEach(function (item) {
            item.addEventListener('click', function () {
                var tpl = YDB.Templates.library.find(function (t) { return t.id === item.dataset.tpl; });
                if (tpl) YDB.Templates.showParams(tpl);
            });
        });
    },

    showParams: function (tpl) {
        var el = document.getElementById('template-params');
        var h = '<div class="p-3 border border-base-300 rounded-lg bg-base-200">';
        h += '<div class="text-sm font-semibold mb-2">' + tpl.name + '</div>';
        h += '<pre class="text-xs font-mono text-primary mb-3">' + tpl.sql + '</pre>';
        tpl.params.forEach(function (p) {
            h += '<div class="form-control mb-2"><label class="label py-0"><span class="label-text text-xs">{{' + p + '}}</span></label>';
            h += '<input type="text" class="input input-bordered input-xs" id="tpl-param-' + p + '" placeholder="' + p + '"></div>';
        });
        h += '</div>';
        el.innerHTML = h;
        el.dataset.activeTemplate = tpl.id;
    },

    applyTemplate: function () {
        var el = document.getElementById('template-params');
        var tplId = el.dataset.activeTemplate;
        if (!tplId) { YDB.UI.toast('Select a template first', 'warning'); return; }
        var tpl = this.library.find(function (t) { return t.id === tplId; });
        if (!tpl) return;

        var sql = tpl.sql;
        tpl.params.forEach(function (p) {
            var val = document.getElementById('tpl-param-' + p).value || p;
            sql = sql.replace(new RegExp('\\{\\{' + p + '\\}\\}', 'g'), val);
        });

        document.getElementById('sql-input').value = sql;
        YDB.UI.switchTab('editor');
        YDB.UI.toast('Template applied', 'success');
    }
};
