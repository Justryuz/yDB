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
        // Data Quality
        document.getElementById('btn-data-quality').addEventListener('click', function () {
            var conn = YDB.State.activeConnection;
            var table = YDB.State.activeTable;
            if (!conn || !table) { YDB.UI.toast('Select a table first', 'warning'); return; }
            YDB.Explorer.runDataQuality(conn.id, table);
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
        var self = this;
        var conn = YDB.State.activeConnection;
        var container = document.getElementById('tree-container');
        if (!conn) { container.innerHTML = '<p class="text-base-content/50 text-sm">Select a connection</p>'; return; }

        // Check mock data first
        var schema = YDB.MockData.schemas[conn.id];
        if (schema) {
            self._renderTreeFromSchema(schema);
            return;
        }

        // No mock data — try fetching from API
        if (YDB.API.isOnline() && YDB.API.token) {
            container.innerHTML = '<p class="text-base-content/50 text-sm"><span class="loading loading-spinner loading-xs"></span> Loading schema...</p>';
            YDB.API.get('/explorer/' + conn.id + '/schema').then(function (schema) {
                // Cache in mock data for subsequent renders
                YDB.MockData.schemas[conn.id] = schema;
                self._renderTreeFromSchema(schema);
            }).catch(function (err) {
                container.innerHTML = '<p class="text-error text-sm">Error: ' + err.message + '</p>';
            });
        } else {
            container.innerHTML = '<p class="text-base-content/50 text-sm">No schema for this connection (offline mode)</p>';
        }
    },

    _renderTreeFromSchema: function (schema) {
        var container = document.getElementById('tree-container');
        var h = '';
        h += this._node('database', schema.name, 'database', true);
        h += '<div class="tree-children open">';
        // Tables
        var tables = Object.keys(schema.tables || {});
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
        var self = this;
        var conn = YDB.State.activeConnection;
        if (!conn) return;

        YDB.State.activeTable = name;

        // Enable toolbar buttons
        document.getElementById('viewer-header').querySelector('span').textContent = name + ' (loading...)';
        document.querySelectorAll('#viewer-header [data-export]').forEach(function (b) { b.disabled = false; });
        document.getElementById('btn-edit-mode').disabled = false;
        document.getElementById('btn-view-ddl').disabled = false;
        document.getElementById('btn-view-struct').disabled = false;
        document.getElementById('btn-explain').disabled = false;

        // Highlight in tree
        document.querySelectorAll('#tree-container [data-table]').forEach(function (el) { el.classList.toggle('selected', el.dataset.table === name); });

        // Get schema (cached in MockData after first load)
        var schema = YDB.MockData.schemas[conn.id];

        // If schema has data already (mock or previously fetched), render directly
        if (schema && schema.tables[name] && schema.tables[name].data) {
            self._renderTableData(name, schema.tables[name]);
            return;
        }

        // Fetch from API
        if (YDB.API.isOnline() && YDB.API.token) {
            YDB.API.get('/explorer/' + conn.id + '/tables/' + name + '/data?perPage=100').then(function (result) {
                // Cache data in schema
                if (!schema) { schema = { name: conn.database, tables: {} }; YDB.MockData.schemas[conn.id] = schema; }
                if (!schema.tables[name]) schema.tables[name] = { columns: [], data: [] };
                schema.tables[name].data = result.data;
                if (result.columns && result.columns.length) {
                    schema.tables[name].columns = result.columns.map(function (c) { return typeof c === 'string' ? { name: c, type: '', nullable: true, key: '' } : c; });
                }
                self._renderTableData(name, schema.tables[name]);
            }).catch(function (err) {
                document.getElementById('data-viewer').innerHTML = '<p class="text-error text-sm m-4">' + err.message + '</p>';
            });
        } else if (schema && schema.tables[name]) {
            self._renderTableData(name, schema.tables[name]);
        } else {
            document.getElementById('data-viewer').innerHTML = '<p class="text-base-content/40 text-sm m-4">No data available (offline)</p>';
        }
    },

    /** Run AI Data Quality scan on a table */
    runDataQuality: function (connId, tableName) {
        if (!YDB.API.isOnline() || !YDB.API.token) { YDB.UI.toast('Backend not available', 'error'); return; }

        YDB.UI.toast('Scanning data quality...', 'info');
        var viewer = document.getElementById('data-viewer');
        viewer.innerHTML = '<div class="p-4 text-center text-base-content/50"><span class="loading loading-spinner loading-sm"></span> AI analyzing data quality...</div>';

        YDB.API.post('/ai/data-quality', { connectionId: connId, tableName: tableName }).then(function (report) {
            var h = '<div class="p-4">';

            // Score badge
            var scoreColor = report.score >= 80 ? 'text-success' : report.score >= 60 ? 'text-warning' : 'text-error';
            h += '<div class="flex items-center gap-3 mb-4">';
            h += '<div class="text-3xl font-bold ' + scoreColor + '">' + report.score + '/100</div>';
            h += '<div><div class="font-semibold">Data Quality Score</div>';
            h += '<div class="text-xs text-base-content/60">' + report.totalRows + ' rows, ' + report.columnCount + ' columns analyzed</div></div>';
            h += '</div>';

            // Summary
            h += '<div class="text-sm text-base-content/80 mb-4">' + report.summary + '</div>';

            // Issues
            if (report.issues && report.issues.length > 0) {
                h += '<div class="text-sm font-semibold mb-2">Issues Found (' + report.issues.length + ')</div>';
                h += '<div class="space-y-1">';
                report.issues.forEach(function (issue) {
                    var icon = issue.severity >= 3 ? 'text-error' : issue.severity >= 2 ? 'text-warning' : 'text-info';
                    var badge = issue.severity >= 3 ? 'Critical' : issue.severity >= 2 ? 'Warning' : 'Info';
                    h += '<div class="flex items-start gap-2 bg-base-200 rounded p-2 text-xs">';
                    h += '<span class="badge badge-xs ' + icon + '">' + badge + '</span>';
                    h += '<div class="flex-1">';
                    h += '<span class="font-mono text-primary">' + issue.column + '</span> — ' + issue.message;
                    h += '</div></div>';
                });
                h += '</div>';
            }

            // Fix suggestions
            if (report.fixes && report.fixes.length > 0) {
                h += '<div class="text-sm font-semibold mt-4 mb-2">Suggested Fixes (' + report.fixes.length + ')</div>';
                h += '<div class="space-y-1">';
                report.fixes.forEach(function (fix) {
                    h += '<div class="bg-base-300/50 rounded p-2 text-xs font-mono flex items-center gap-2">';
                    h += '<pre class="flex-1 whitespace-pre-wrap text-success">' + fix + '</pre>';
                    h += '<button class="btn btn-xs btn-ghost text-primary shrink-0" onclick="document.getElementById(\'sql-input\').value=this.dataset.sql;YDB.UI.toast(\'Copied to SQL Editor\',\'success\');document.querySelector(\'[data-tab=editor]\').click()" data-sql="' + fix.replace(/"/g, '&quot;') + '">Copy</button>';
                    h += '</div>';
                });
                h += '</div>';
            }

            h += '</div>';
            viewer.innerHTML = h;
        }).catch(function (err) {
            viewer.innerHTML = '<div class="p-4 text-error text-sm">Quality scan failed: ' + err.message + '</div>';
        });
    },

    /** @private Render table data into viewer */
    _renderTableData: function (name, table) {
        var data = table.data || [];
        var cols = (table.columns || []).map(function (c) { return c.name || c; });

        // Update header
        document.getElementById('viewer-header').querySelector('span').textContent = name + ' (' + data.length + ' rows)';

        if (!data.length) {
            document.getElementById('data-viewer').innerHTML = '<p class="text-base-content/40 text-sm m-4">Table is empty</p>';
            return;
        }

        // If no column metadata, derive from data
        if (!cols.length && data.length) cols = Object.keys(data[0]);

        // Apply masking
        if (YDB.Masking.enabled) {
            data = YDB.Masking.applyToData(cols, data);
        }

        // Render
        var headers = (table.columns || []).map(function (c) {
            return (c.name || c) + (c.type ? ' <span class="text-base-content/30 font-normal text-xs">' + c.type + '</span>' : '');
        });
        if (!headers.length) headers = cols;

        YDB.UI.renderTable('data-viewer', cols, headers, data);
        setTimeout(function () { YDB.Filtering.enhance('data-viewer'); }, 50);
    },

    clear: function () {
        document.getElementById('tree-container').innerHTML = '<p class="text-base-content/50 text-sm">Select a connection</p>';
        document.getElementById('data-viewer').innerHTML = '<p class="text-base-content/40 text-center mt-10">Select a table to view data</p>';
        document.getElementById('viewer-header').querySelector('span').textContent = 'No table selected';
        document.querySelectorAll('#viewer-header [data-export]').forEach(function (b) { b.disabled = true; });
    }
};
