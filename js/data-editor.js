/**
 * YDB - Table Data Editor (Inline CRUD)
 * Allows editing cells, adding rows, deleting rows, generates SQL statements.
 */
YDB.DataEditor = {
    editingCell: null,
    pendingChanges: [],

    init: function () {
        // Edit mode toggle is triggered from explorer context
    },

    /**
     * Render editable data table for a given table
     */
    renderEditable: function (containerId, tableName, connId) {
        var schema = YDB.MockData.schemas[connId];
        if (!schema || !schema.tables[tableName]) return;
        var table = schema.tables[tableName];
        var cols = table.columns;
        var data = table.data;

        var h = '<div class="flex items-center gap-2 mb-2">';
        h += '<button class="btn btn-success btn-xs" onclick="YDB.DataEditor.addRow(\'' + connId + '\',\'' + tableName + '\')"><i data-lucide="plus" class="w-3 h-3"></i>Add Row</button>';
        h += '<button class="btn btn-warning btn-xs" onclick="YDB.DataEditor.showPendingSQL()"><i data-lucide="code" class="w-3 h-3"></i>Show SQL (' + '<span id="change-count">0</span>)</button>';
        h += '<button class="btn btn-ghost btn-xs" onclick="YDB.DataEditor.exitEdit()"><i data-lucide="x" class="w-3 h-3"></i>Exit Edit</button>';
        h += '</div>';
        h += '<div class="overflow-x-auto"><table class="data-table" id="edit-table"><thead><tr>';
        h += '<th class="w-8">#</th>';
        cols.forEach(function (c) { h += '<th>' + c.name + '</th>'; });
        h += '<th class="w-10">Actions</th>';
        h += '</tr></thead><tbody>';

        data.forEach(function (row, idx) {
            h += '<tr data-row="' + idx + '">';
            h += '<td class="text-base-content/40">' + (idx + 1) + '</td>';
            cols.forEach(function (c) {
                var val = row[c.name];
                var display = val === null || val === undefined ? '<span class="italic text-base-content/30">NULL</span>' : YDB.UI.esc(String(val));
                h += '<td class="editable-cell cursor-pointer hover:bg-primary/10" data-row="' + idx + '" data-col="' + c.name + '" data-orig="' + (val == null ? '' : YDB.UI.esc(String(val))) + '">' + display + '</td>';
            });
            h += '<td><button class="btn btn-ghost btn-xs text-error" onclick="YDB.DataEditor.deleteRow(\'' + connId + '\',\'' + tableName + '\',' + idx + ')"><i data-lucide="trash-2" class="w-3 h-3"></i></button></td>';
            h += '</tr>';
        });
        h += '</tbody></table></div>';

        document.getElementById(containerId).innerHTML = h;
        YDB.UI.icons();
        this._bindCellEditing(connId, tableName);
    },

    _bindCellEditing: function (connId, tableName) {
        var self = this;
        document.querySelectorAll('#edit-table .editable-cell').forEach(function (cell) {
            cell.addEventListener('dblclick', function () {
                if (self.editingCell) self._commitCell();
                self.editingCell = this;
                var val = this.dataset.orig;
                this.innerHTML = '<input type="text" class="input input-xs input-bordered w-full" value="' + val + '">';
                var input = this.querySelector('input');
                input.focus(); input.select();
                input.addEventListener('blur', function () { self._commitCell(); });
                input.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') { self._commitCell(); }
                    if (e.key === 'Escape') { self.editingCell.innerHTML = self.editingCell.dataset.orig || '<span class="italic text-base-content/30">NULL</span>'; self.editingCell = null; }
                });
            });
        });
    },

    _commitCell: function () {
        if (!this.editingCell) return;
        var cell = this.editingCell;
        var input = cell.querySelector('input');
        if (!input) return;
        var newVal = input.value;
        var oldVal = cell.dataset.orig;

        if (newVal !== oldVal) {
            cell.dataset.orig = newVal;
            cell.innerHTML = newVal || '<span class="italic text-base-content/30">NULL</span>';
            cell.classList.add('bg-warning/20');
            this.pendingChanges.push({
                type: 'UPDATE', row: parseInt(cell.dataset.row), col: cell.dataset.col, oldVal: oldVal, newVal: newVal
            });
            var countEl = document.getElementById('change-count');
            if (countEl) countEl.textContent = this.pendingChanges.length;
        } else {
            cell.innerHTML = oldVal || '<span class="italic text-base-content/30">NULL</span>';
        }
        this.editingCell = null;
    },

    addRow: function (connId, tableName) {
        var schema = YDB.MockData.schemas[connId];
        var table = schema.tables[tableName];
        var newRow = {};
        table.columns.forEach(function (c) { newRow[c.name] = null; });
        table.data.push(newRow);
        this.pendingChanges.push({ type: 'INSERT', row: table.data.length - 1 });
        this.renderEditable('data-viewer', tableName, connId);
        YDB.UI.toast('New row added', 'success');
    },

    deleteRow: function (connId, tableName, rowIdx) {
        if (!confirm('Delete this row?')) return;
        var schema = YDB.MockData.schemas[connId];
        var table = schema.tables[tableName];
        var row = table.data[rowIdx];
        this.pendingChanges.push({ type: 'DELETE', row: rowIdx, data: Object.assign({}, row) });
        table.data.splice(rowIdx, 1);
        this.renderEditable('data-viewer', tableName, connId);
        YDB.UI.toast('Row deleted', 'info');
    },

    showPendingSQL: function () {
        if (!this.pendingChanges.length) { YDB.UI.toast('No changes', 'info'); return; }
        var conn = YDB.State.activeConnection;
        var tableName = YDB.State.activeTable;
        var schema = YDB.MockData.schemas[conn.id];
        var table = schema.tables[tableName];
        var cols = table.columns;

        var sqls = this.pendingChanges.map(function (ch) {
            if (ch.type === 'UPDATE') {
                return 'UPDATE ' + tableName + ' SET ' + ch.col + " = '" + ch.newVal + "' WHERE /* row " + ch.row + ' */;';
            } else if (ch.type === 'INSERT') {
                return 'INSERT INTO ' + tableName + ' (' + cols.map(function (c) { return c.name; }).join(', ') + ') VALUES (...);';
            } else if (ch.type === 'DELETE') {
                var pk = cols.find(function (c) { return c.key === 'PK'; });
                var where = pk && ch.data[pk.name] ? pk.name + ' = ' + ch.data[pk.name] : '/* condition */';
                return 'DELETE FROM ' + tableName + ' WHERE ' + where + ';';
            }
            return '';
        });

        document.getElementById('sql-input').value = sqls.join('\n');
        YDB.UI.switchTab('editor');
        YDB.UI.toast('SQL generated from ' + this.pendingChanges.length + ' changes', 'success');
    },

    exitEdit: function () {
        this.pendingChanges = [];
        this.editingCell = null;
        if (YDB.State.activeTable) YDB.Explorer.selectTable(YDB.State.activeTable);
    }
};
