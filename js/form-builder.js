/**
 * YDB - Form Query Builder
 * Non-technical query building via dropdowns, no SQL needed.
 */
YDB.FormBuilder = {
    conditions: [],

    init: function () {
        var self = this;
        document.getElementById('form-builder-table').addEventListener('change', function () { self._onTableChange(); });
        document.getElementById('btn-fb-add-condition').addEventListener('click', function () { self.addCondition(); });
        document.getElementById('btn-fb-run').addEventListener('click', function () { self.run(); });
        document.getElementById('btn-fb-clear').addEventListener('click', function () { self.clear(); });
    },

    populateTables: function () {
        var conn = YDB.State.activeConnection;
        var sel = document.getElementById('form-builder-table');
        sel.innerHTML = '<option value="">Select table...</option>';
        if (!conn) return;
        var schema = YDB.MockData.schemas[conn.id];
        if (!schema) return;
        Object.keys(schema.tables).forEach(function (t) { sel.innerHTML += '<option value="' + t + '">' + t + '</option>'; });
    },

    _onTableChange: function () {
        var conn = YDB.State.activeConnection;
        if (!conn) return;
        var tableName = document.getElementById('form-builder-table').value;
        var schema = YDB.MockData.schemas[conn.id];
        if (!schema || !tableName) return;
        var table = schema.tables[tableName];

        // Populate columns checkboxes
        var colsEl = document.getElementById('fb-columns');
        colsEl.innerHTML = table.columns.map(function (c) {
            return '<label class="flex items-center gap-1 text-xs"><input type="checkbox" class="checkbox checkbox-xs" value="' + c.name + '" checked>' + c.name + '</label>';
        }).join('');

        // Populate condition column dropdown
        var condCol = document.getElementById('fb-cond-col');
        condCol.innerHTML = table.columns.map(function (c) { return '<option value="' + c.name + '">' + c.name + '</option>'; }).join('');

        this.conditions = [];
        this._renderConditions();
    },

    addCondition: function () {
        var col = document.getElementById('fb-cond-col').value;
        var op = document.getElementById('fb-cond-op').value;
        var val = document.getElementById('fb-cond-val').value;
        if (!col || !val) { YDB.UI.toast('Fill column and value', 'warning'); return; }
        this.conditions.push({ col: col, op: op, val: val });
        document.getElementById('fb-cond-val').value = '';
        this._renderConditions();
    },

    _renderConditions: function () {
        var el = document.getElementById('fb-conditions-list');
        if (!this.conditions.length) { el.innerHTML = '<p class="text-xs text-base-content/40">No conditions (returns all rows)</p>'; return; }
        el.innerHTML = this.conditions.map(function (c, i) {
            return '<div class="flex items-center gap-1 text-xs badge badge-ghost">' + c.col + ' ' + c.op + ' \'' + c.val + '\''
                + '<button class="ml-1" onclick="YDB.FormBuilder.removeCondition(' + i + ')">&times;</button></div>';
        }).join(' ');
    },

    removeCondition: function (idx) {
        this.conditions.splice(idx, 1);
        this._renderConditions();
    },

    run: function () {
        var tableName = document.getElementById('form-builder-table').value;
        if (!tableName) { YDB.UI.toast('Select a table', 'warning'); return; }

        // Get selected columns
        var cols = [];
        document.querySelectorAll('#fb-columns input:checked').forEach(function (cb) { cols.push(cb.value); });
        if (!cols.length) { YDB.UI.toast('Select at least one column', 'warning'); return; }

        // Build SQL
        var sql = 'SELECT ' + cols.join(', ') + ' FROM ' + tableName;
        if (this.conditions.length) {
            var where = this.conditions.map(function (c) {
                if (c.op === 'LIKE') return c.col + " LIKE '%" + c.val + "%'";
                return c.col + ' ' + c.op + " '" + c.val + "'";
            });
            sql += ' WHERE ' + where.join(' AND ');
        }

        var orderBy = document.getElementById('fb-order').value;
        if (orderBy) sql += ' ORDER BY ' + orderBy;
        var limit = document.getElementById('fb-limit').value;
        if (limit) sql += ' LIMIT ' + limit;

        // Show generated SQL
        document.getElementById('fb-generated-sql').textContent = sql;

        // Execute
        var result = YDB.QueryEngine.execute(sql);
        if (result.error) { document.getElementById('fb-results').innerHTML = '<div class="alert alert-error text-sm">' + result.error + '</div>'; return; }
        YDB.UI.renderTable('fb-results', result.columns, result.columns, result.data);
        YDB.Audit.log(sql);
        YDB.UI.toast('Query executed: ' + result.data.length + ' rows', 'success');
    },

    clear: function () {
        this.conditions = [];
        document.getElementById('form-builder-table').value = '';
        document.getElementById('fb-columns').innerHTML = '';
        document.getElementById('fb-generated-sql').textContent = '';
        document.getElementById('fb-results').innerHTML = '';
        this._renderConditions();
    }
};
