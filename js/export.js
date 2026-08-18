/**
 * @file export.js
 * @description Data export utilities — CSV, JSON, and Excel (XML-based XLS).
 * @module YDB.Export
 */

YDB.Export = {

    /**
     * Export data as CSV and trigger download.
     * @param {Object[]} data - Array of row objects
     * @param {string[]} columns - Column keys
     * @param {string} [filename='export'] - Download filename (without extension)
     */
    csv: function (data, columns, filename) {
        if (!data || !data.length) { YDB.UI.toast('No data to export', 'warning'); return; }

        var lines = [columns.join(',')];
        data.forEach(function (row) {
            var vals = columns.map(function (c) {
                var v = row[c];
                if (v == null) return '';
                v = String(v);
                if (/[,"\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
                return v;
            });
            lines.push(vals.join(','));
        });

        this._download(lines.join('\n'), (filename || 'export') + '.csv', 'text/csv');
        YDB.UI.toast('Exported CSV', 'success');
    },

    /**
     * Export data as formatted JSON and trigger download.
     * @param {Object[]} data - Array of row objects
     * @param {string} [filename='export'] - Download filename (without extension)
     */
    json: function (data, filename) {
        if (!data || !data.length) { YDB.UI.toast('No data to export', 'warning'); return; }
        this._download(JSON.stringify(data, null, 2), (filename || 'export') + '.json', 'application/json');
        YDB.UI.toast('Exported JSON', 'success');
    },

    /**
     * Export data as Excel-compatible XML and trigger download.
     * @param {Object[]} data - Array of row objects
     * @param {string[]} columns - Column keys
     * @param {string} [filename='export'] - Download filename (without extension)
     */
    excel: function (data, columns, filename) {
        if (!data || !data.length) { YDB.UI.toast('No data to export', 'warning'); return; }

        var xml = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>';
        xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
        xml += '<Worksheet ss:Name="Sheet1"><Table>';

        // Header row
        xml += '<Row>';
        columns.forEach(function (c) {
            xml += '<Cell><Data ss:Type="String">' + YDB.UI.escXml(c) + '</Data></Cell>';
        });
        xml += '</Row>';

        // Data rows
        data.forEach(function (row) {
            xml += '<Row>';
            columns.forEach(function (c) {
                var v = row[c];
                if (v == null) v = '';
                var type = typeof v === 'number' ? 'Number' : 'String';
                xml += '<Cell><Data ss:Type="' + type + '">' + YDB.UI.escXml(String(v)) + '</Data></Cell>';
            });
            xml += '</Row>';
        });

        xml += '</Table></Worksheet></Workbook>';
        this._download(xml, (filename || 'export') + '.xls', 'application/vnd.ms-excel');
        YDB.UI.toast('Exported Excel', 'success');
    },

    /**
     * Export from a pagination container by type.
     * @param {string} containerId - Container with rendered paginated data
     * @param {string} type - 'csv' | 'json' | 'excel'
     * @param {string} [filename] - Download filename
     */
    fromContainer: function (containerId, type, filename) {
        var d = YDB.UI.getResultsData(containerId);
        if (!d) { YDB.UI.toast('No data to export', 'warning'); return; }

        switch (type) {
            case 'csv':   this.csv(d.data, d.columns, filename); break;
            case 'json':  this.json(d.data, filename); break;
            case 'excel': this.excel(d.data, d.columns, filename); break;
        }
    },

    /**
     * Trigger a file download in the browser.
     * @private
     * @param {string} content - File content
     * @param {string} filename - Full filename with extension
     * @param {string} mime - MIME type
     */
    _download: function (content, filename, mime) {
        var blob = new Blob([content], { type: mime });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};
