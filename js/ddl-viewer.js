/**
 * YDB - DDL/Schema Viewer
 * Generates CREATE TABLE statements from schema metadata.
 */
YDB.DDLViewer = {
    init: function () {
        document.getElementById('btn-copy-ddl').addEventListener('click', function () {
            var text = document.getElementById('ddl-content').textContent;
            navigator.clipboard.writeText(text).then(function () { YDB.UI.toast('DDL copied!', 'success'); });
        });
    },

    show: function (connId, tableName) {
        var schema = YDB.MockData.schemas[connId];
        if (!schema || !schema.tables[tableName]) return;
        var table = schema.tables[tableName];
        var conn = YDB.State.connections.find(function (c) { return c.id === connId; });
        var dbType = conn ? conn.type : 'sql';

        var ddl = this._generate(tableName, table, dbType);
        document.getElementById('ddl-content').textContent = ddl;
        document.getElementById('modal-ddl').showModal();
    },

    _generate: function (name, table, dbType) {
        var lines = ['CREATE TABLE ' + name + ' ('];
        var colDefs = [];

        table.columns.forEach(function (col) {
            var def = '  ' + col.name + ' ' + col.type;
            if (col.key === 'PK') def += ' PRIMARY KEY';
            if (!col.nullable && col.key !== 'PK') def += ' NOT NULL';
            if (col.key === 'UQ') def += ' UNIQUE';
            colDefs.push(def);
        });

        // Foreign keys
        table.columns.forEach(function (col) {
            if (col.key === 'FK') {
                var refTable = col.name.replace('_id', '') + 's';
                colDefs.push('  FOREIGN KEY (' + col.name + ') REFERENCES ' + refTable + '(id)');
            }
        });

        lines.push(colDefs.join(',\n'));
        lines.push(');');

        // Add index hints
        table.columns.forEach(function (col) {
            if (col.key === 'FK') {
                lines.push('');
                lines.push('CREATE INDEX idx_' + name + '_' + col.name + ' ON ' + name + '(' + col.name + ');');
            }
        });

        return lines.join('\n');
    }
};
