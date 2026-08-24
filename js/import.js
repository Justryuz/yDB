/**
 * YDB - Import Data (CSV/JSON/Excel)
 */
YDB.Import = {
    parsedData: null,
    parsedColumns: null,

    init: function () {
        var self = this;
        var dropzone = document.getElementById('import-dropzone');
        var fileInput = document.getElementById('import-file');

        dropzone.addEventListener('click', function () { fileInput.click(); });
        dropzone.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('border-primary'); });
        dropzone.addEventListener('dragleave', function () { this.classList.remove('border-primary'); });
        dropzone.addEventListener('drop', function (e) { e.preventDefault(); this.classList.remove('border-primary'); if (e.dataTransfer.files.length) self._handleFile(e.dataTransfer.files[0]); });
        fileInput.addEventListener('change', function () { if (this.files.length) self._handleFile(this.files[0]); });
        document.getElementById('btn-import-clear').addEventListener('click', function () { self._clear(); });
        document.getElementById('btn-import-exec').addEventListener('click', function () { self._execute(); });
    },

    populateConnections: function () {
        var sel = document.getElementById('import-target-conn');
        
        function render(conns) {
            sel.innerHTML = '<option value="">Select connection...</option>' + conns.map(function (c) {
                var name = c.name + ' (' + (c.type || c.db_type || '') + ')';
                return '<option value="' + c.id + '">' + name + '</option>';
            }).join('');
        }

        if (YDB.State.connections && YDB.State.connections.length > 0) {
            render(YDB.State.connections);
        } else if (YDB.API.isOnline() && YDB.API.token) {
            YDB.API.get('/connections').then(function (conns) {
                YDB.State.connections = conns.map(function (c) {
                    return { id: c.id, name: c.name, type: c.db_type, host: c.host, port: c.port, username: c.username, database: c.database_name };
                });
                render(YDB.State.connections);
            }).catch(function () {});
        }
    },

    _handleFile: function (file) {
        var self = this;
        var ext = file.name.split('.').pop().toLowerCase();
        document.getElementById('import-file-name').textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
        document.getElementById('import-table-name').value = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        var reader = new FileReader();
        reader.onload = function (e) {
            var content = e.target.result;
            if (ext === 'csv') self._parseCSV(content);
            else if (ext === 'json') self._parseJSON(content);
            else { YDB.UI.toast('Unsupported format. Use CSV or JSON.', 'error'); return; }

            if (self.parsedData) {
                self._showPreview();
                document.getElementById('import-preview-area').classList.remove('hidden');
            }
        };
        reader.readAsText(file);
    },

    _parseCSV: function (content) {
        var lines = content.trim().split('\n');
        if (lines.length < 2) { YDB.UI.toast('CSV file is empty', 'warning'); return; }
        this.parsedColumns = lines[0].split(',').map(function (c) { return c.trim().replace(/"/g, ''); });
        this.parsedData = [];
        for (var i = 1; i < lines.length; i++) {
            var vals = lines[i].split(',');
            var row = {};
            this.parsedColumns.forEach(function (col, idx) { row[col] = vals[idx] ? vals[idx].trim().replace(/"/g, '') : null; });
            this.parsedData.push(row);
        }
    },

    _parseJSON: function (content) {
        try {
            var data = JSON.parse(content);
            if (!Array.isArray(data)) data = [data];
            if (!data.length) { YDB.UI.toast('JSON array is empty', 'warning'); return; }
            this.parsedColumns = Object.keys(data[0]);
            this.parsedData = data;
        } catch (e) { YDB.UI.toast('Invalid JSON', 'error'); }
    },

    _showPreview: function () {
        var h = '<table class="data-table"><thead><tr>';
        this.parsedColumns.forEach(function (c) { h += '<th>' + c + '</th>'; });
        h += '</tr></thead><tbody>';
        this.parsedData.slice(0, 5).forEach(function (row) {
            h += '<tr>';
            YDB.Import.parsedColumns.forEach(function (c) { h += '<td>' + (row[c] || '') + '</td>'; });
            h += '</tr>';
        });
        h += '</tbody></table>';
        if (this.parsedData.length > 5) h += '<p class="text-xs text-base-content/50 mt-1">...and ' + (this.parsedData.length - 5) + ' more rows</p>';
        document.getElementById('import-preview').innerHTML = h;
    },

    _execute: function () {
        if (!this.parsedData) { YDB.UI.toast('No data loaded', 'warning'); return; }
        var tableName = document.getElementById('import-table-name').value.trim() || 'imported_data';
        var connId = document.getElementById('import-target-conn').value;
        if (!connId) { YDB.UI.toast('Select target connection', 'warning'); return; }

        // Create table in mock schema
        var schema = YDB.MockData.schemas[connId];
        if (!schema) { YDB.UI.toast('Invalid connection', 'error'); return; }

        var columns = this.parsedColumns.map(function (c) {
            return { name: c, type: 'VARCHAR(255)', key: '', nullable: true };
        });
        schema.tables[tableName] = { columns: columns, data: this.parsedData };

        this._clear();
        YDB.Connections.render();
        YDB.Builder.renderTablesList();
        YDB.UI.toast('Imported ' + this.parsedData.length + ' rows into ' + tableName, 'success');
    },

    _clear: function () {
        this.parsedData = null;
        this.parsedColumns = null;
        document.getElementById('import-preview-area').classList.add('hidden');
        document.getElementById('import-file').value = '';
    }
};
