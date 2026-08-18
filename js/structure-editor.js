/**
 * YDB - Table Structure Editor
 * Add/modify/drop columns, change types, add indexes.
 */
YDB.StructureEditor = {
    currentTable: null,
    currentConn: null,
    modifications: [],

    init: function () {
        var self = this;
        document.getElementById('btn-struct-add-col').addEventListener('click', function () { self.addColumn(); });
        document.getElementById('btn-struct-gen-ddl').addEventListener('click', function () { self.generateAlter(); });
    },

    open: function (connId, tableName) {
        this.currentConn = connId;
        this.currentTable = tableName;
        this.modifications = [];

        var schema = YDB.MockData.schemas[connId];
        var table = schema.tables[tableName];
        document.getElementById('struct-table-name').textContent = tableName;

        var h = '<table class="table table-xs w-full"><thead><tr><th>Column</th><th>Type</th><th>Nullable</th><th>Key</th><th>Actions</th></tr></thead><tbody>';
        table.columns.forEach(function (col, idx) {
            h += '<tr data-idx="' + idx + '">';
            h += '<td><input type="text" class="input input-xs input-bordered w-28" value="' + col.name + '" data-field="name" data-idx="' + idx + '"></td>';
            h += '<td><input type="text" class="input input-xs input-bordered w-28" value="' + col.type + '" data-field="type" data-idx="' + idx + '"></td>';
            h += '<td><input type="checkbox" class="checkbox checkbox-xs"' + (col.nullable ? ' checked' : '') + ' data-field="nullable" data-idx="' + idx + '"></td>';
            h += '<td><select class="select select-xs select-bordered" data-field="key" data-idx="' + idx + '">';
            ['', 'PK', 'FK', 'UQ'].forEach(function (k) { h += '<option value="' + k + '"' + (col.key === k ? ' selected' : '') + '>' + (k || '-') + '</option>'; });
            h += '</select></td>';
            h += '<td><button class="btn btn-ghost btn-xs text-error" onclick="YDB.StructureEditor.dropColumn(' + idx + ')"><i data-lucide="trash-2" class="w-3 h-3"></i></button></td>';
            h += '</tr>';
        });
        h += '</tbody></table>';

        document.getElementById('struct-editor').innerHTML = h;
        document.getElementById('struct-ddl-output').classList.add('hidden');
        document.getElementById('modal-structure').showModal();
        YDB.UI.icons();
    },

    addColumn: function () {
        var schema = YDB.MockData.schemas[this.currentConn];
        var table = schema.tables[this.currentTable];
        table.columns.push({ name: 'new_column', type: 'VARCHAR(255)', key: '', nullable: true });
        this.modifications.push({ action: 'ADD', col: 'new_column', type: 'VARCHAR(255)' });
        this.open(this.currentConn, this.currentTable);
        YDB.UI.toast('Column added', 'success');
    },

    dropColumn: function (idx) {
        if (!confirm('Drop this column?')) return;
        var schema = YDB.MockData.schemas[this.currentConn];
        var table = schema.tables[this.currentTable];
        var col = table.columns[idx];
        this.modifications.push({ action: 'DROP', col: col.name });
        table.columns.splice(idx, 1);
        table.data.forEach(function (row) { delete row[col.name]; });
        this.open(this.currentConn, this.currentTable);
        YDB.UI.toast('Column dropped', 'info');
    },

    generateAlter: function () {
        var lines = [];
        var tn = this.currentTable;
        this.modifications.forEach(function (m) {
            if (m.action === 'ADD') lines.push('ALTER TABLE ' + tn + ' ADD COLUMN ' + m.col + ' ' + m.type + ';');
            else if (m.action === 'DROP') lines.push('ALTER TABLE ' + tn + ' DROP COLUMN ' + m.col + ';');
            else if (m.action === 'MODIFY') lines.push('ALTER TABLE ' + tn + ' MODIFY COLUMN ' + m.col + ' ' + m.type + ';');
        });
        if (!lines.length) lines.push('-- No modifications yet');
        var el = document.getElementById('struct-ddl-output');
        el.textContent = lines.join('\n');
        el.classList.remove('hidden');
    }
};
