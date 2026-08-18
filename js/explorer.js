/**
 * YDB - Database Explorer (tree + data viewer)
 */
YDB.Explorer = {
    init: function () {
        var self = this;
        // Export buttons
        document.querySelectorAll('#viewer-header [data-export]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var d = YDB.UI.getResultsData('data-viewer');
                if (d) YDB.Export.fromContainer('data-viewer', this.dataset.export, YDB.State.activeTable || 'data');
            });
        });
        // Edit mode
        document.getElementById('btn-edit-mode').addEventListener('click', function () {
            var conn = YDB.State.activeConnection;
            var table = YDB.State.activeTable;
            if (conn && table) YDB.DataEditor.renderEditable('data-viewer', table, conn.id);
        });
        // DDL
        document.getElementById('btn-view-ddl').addEventListener('click', function () {
            var conn = YDB.State.activeConnection;
            var table = YDB.State.activeTable;
            if (conn && table) YDB.DDLViewer.show(conn.id, table);
        });
        // Structure
        document.getElementById('btn-view-struct').addEventListener('click', function () {
            var conn = YDB.State.activeConnection;
            var table = YDB.State.activeTable;
            if (conn && table) YDB.StructureEditor.open(conn.id, table);
        });
        // Masking toggle
        document.getElementById('btn-toggle-mask').addEventListener('click', function () {
            YDB.Masking.toggle();
            if (YDB.State.activeTable) self.selectTable(YDB.State.activeTable);
        });
        // Explain
        document.getElementById('btn-explain').addEventListener('click', function () {
            var table = YDB.State.activeTable;
            if (table) YDB.Explain.render('data-viewer', 'SELECT * FROM ' + table);
        });
        // Tools
        document.getElementById('btn-schedule-open').addEventListener('click', function () { YDB.Schedule.open(); });
        document.getElementById('btn-diff-open').addEventListener('click', function () { YDB.Diff.open(); });
        document.getElementById('btn-collab-open').addEventListener('click', function () { YDB.Collab.open('connection', YDB.State.activeConnection ? YDB.State.activeConnection.name : ''); });
    },

    renderTree: function () {
        var conn = YDB.State.activeConnection;
        var container = document.getElementById('tree-container');
        if (!conn) { container.innerHTML = '<p class="text-base-content/50 text-sm">Select a connection</p>'; return; }

        var schema = YDB.MockData.schemas[conn.id];
        if (!schema) { container.innerHTML = '<p class="text-base-content/50 text-sm">No schema for this connection</p>'; return; }

        var h = '';
        h += this._node('database', schema.name, 'database', true);
        h += '<div class="tree-children open">';
        // Tables
        var tables = Object.keys(schema.tables);
        h += this._node('folder', 'Tables (' + tables.length + ')', 'folder', true);
        h += '<div class="tree-children open">';
        tables.forEach(function (tn) {
            h += '<div class="tree-item" data-table="' + tn + '"><i data-lucide="table-2" class="w-3.5 h-3.5 text-info inline"></i> <span>' + tn + '</span></div>';
        });
        h += '</div>';
        // Views
        if (schema.views && schema.views.length) {
            h += this._node('folder', 'Views (' + schema.views.length + ')', 'eye', false);
            h += '<div class="tree-children">';
            schema.views.forEach(function (v) { h += '<div class="tree-item"><i data-lucide="eye" class="w-3 h-3 text-success inline"></i> <span class="text-xs">' + v + '</span></div>'; });
            h += '</div>';
        }
        h += '</div>';
        container.innerHTML = h;
        YDB.UI.icons();

        // Bind
        container.querySelectorAll('[data-table]').forEach(function (el) {
            el.addEventListener('click', function () { YDB.Explorer.selectTable(this.dataset.table); });
        });
        container.querySelectorAll('.tree-toggle').forEach(function (el) {
            el.addEventListener('click', function () {
                var children = this.parentElement.nextElementSibling;
                if (children && children.classList.contains('tree-children')) {
                    children.classList.toggle('open');
                    var chev = this.querySelector('.tree-chevron');
                    if (chev) chev.classList.toggle('open');
                }
            });
        });
    },

    _node: function (type, label, icon, open) {
        return '<div class="tree-item tree-toggle"><span class="tree-chevron' + (open ? ' open' : '') + '"><i data-lucide="chevron-right" class="w-3 h-3 inline"></i></span> <i data-lucide="' + icon + '" class="w-3.5 h-3.5 inline text-' + (type === 'database' ? 'primary' : 'warning') + '"></i> <span class="text-sm font-medium">' + label + '</span></div>';
    },

    selectTable: function (name) {
        var conn = YDB.State.activeConnection;
        if (!conn) return;
        var schema = YDB.MockData.schemas[conn.id];
        if (!schema || !schema.tables[name]) return;

        YDB.State.activeTable = name;
        var table = schema.tables[name];

        // Header
        document.getElementById('viewer-header').querySelector('span').textContent = name + ' (' + table.data.length + ' rows)';
        document.querySelectorAll('#viewer-header [data-export]').forEach(function (b) { b.disabled = false; });
        document.getElementById('btn-edit-mode').disabled = false;
        document.getElementById('btn-view-ddl').disabled = false;
        document.getElementById('btn-view-struct').disabled = false;
        document.getElementById('btn-explain').disabled = false;

        // Apply masking if enabled
        var data = table.data;
        var cols = table.columns.map(function (c) { return c.name; });
        if (YDB.Masking.enabled) {
            data = YDB.Masking.applyToData(cols, data);
        }

        // Render
        var headers = table.columns.map(function (c) { return c.name + ' <span class="text-base-content/30 font-normal text-xs">' + c.type + '</span>'; });
        YDB.UI.renderTable('data-viewer', cols, headers, data);

        // Apply filtering & sorting enhancement
        setTimeout(function () { YDB.Filtering.enhance('data-viewer'); }, 50);

        // Highlight
        document.querySelectorAll('#tree-container [data-table]').forEach(function (el) { el.classList.toggle('selected', el.dataset.table === name); });
    },

    clear: function () {
        document.getElementById('tree-container').innerHTML = '<p class="text-base-content/50 text-sm">Select a connection</p>';
        document.getElementById('data-viewer').innerHTML = '<p class="text-base-content/40 text-center mt-10">Select a table to view data</p>';
        document.getElementById('viewer-header').querySelector('span').textContent = 'No table selected';
        document.querySelectorAll('#viewer-header [data-export]').forEach(function (b) { b.disabled = true; });
    }
};
