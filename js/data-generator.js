/**
 * YDB - Data Generator
 * Generate fake/test data for tables.
 */
YDB.DataGenerator = {
    fakeData: {
        first_names: ['Ahmad', 'Siti', 'John', 'Jane', 'Wei', 'Priya', 'Ali', 'Emma', 'Carlos', 'Yuki', 'Anna', 'Omar', 'Lisa', 'David', 'Sarah'],
        last_names: ['Rahman', 'Smith', 'Chen', 'Sharma', 'Hassan', 'Wilson', 'Garcia', 'Tanaka', 'Brown', 'Kim', 'Patel', 'Martinez'],
        domains: ['gmail.com', 'outlook.com', 'yahoo.com', 'company.io', 'work.co', 'mail.com'],
        cities: ['New York', 'London', 'Tokyo', 'KL', 'Sydney', 'Berlin', 'Paris', 'Mumbai', 'Toronto', 'Dubai'],
        statuses: ['active', 'inactive', 'pending', 'suspended', 'verified'],
        categories: ['Electronics', 'Clothing', 'Food', 'Books', 'Software', 'Hardware', 'Services']
    },

    init: function () {
        var self = this;
        document.getElementById('btn-generate-data').addEventListener('click', function () { self.generate(); });
    },

    populateTable: function () {
        var conn = YDB.State.activeConnection;
        var sel = document.getElementById('gen-table');
        sel.innerHTML = '<option value="">Select table...</option>';
        if (!conn) return;
        var schema = YDB.MockData.schemas[conn.id];
        if (!schema) return;
        Object.keys(schema.tables).forEach(function (t) { sel.innerHTML += '<option value="' + t + '">' + t + '</option>'; });
    },

    generate: function () {
        var conn = YDB.State.activeConnection;
        if (!conn) { YDB.UI.toast('Select a connection first', 'warning'); return; }
        var tableName = document.getElementById('gen-table').value;
        var count = parseInt(document.getElementById('gen-count').value) || 10;
        if (!tableName) { YDB.UI.toast('Select a table', 'warning'); return; }

        var schema = YDB.MockData.schemas[conn.id];
        var table = schema.tables[tableName];
        if (!table) return;

        var newRows = [];
        var maxId = table.data.reduce(function (max, r) { return Math.max(max, r.id || r._id || 0); }, 0);

        for (var i = 0; i < count; i++) {
            var row = {};
            table.columns.forEach(function (col) {
                row[col.name] = YDB.DataGenerator._genValue(col, maxId + i + 1);
            });
            newRows.push(row);
        }

        table.data = table.data.concat(newRows);
        YDB.UI.toast('Generated ' + count + ' rows for ' + tableName, 'success');

        // Show preview
        var preview = document.getElementById('gen-preview');
        var h = '<div class="text-xs font-semibold mb-1">Preview (first 5):</div><div class="overflow-x-auto"><table class="data-table"><thead><tr>';
        table.columns.forEach(function (c) { h += '<th>' + c.name + '</th>'; });
        h += '</tr></thead><tbody>';
        newRows.slice(0, 5).forEach(function (r) {
            h += '<tr>'; table.columns.forEach(function (c) { h += '<td>' + (r[c.name] || '') + '</td>'; }); h += '</tr>';
        });
        h += '</tbody></table></div>';
        preview.innerHTML = h;
    },

    _genValue: function (col, idx) {
        var name = col.name.toLowerCase();
        var type = col.type.toLowerCase();

        if (col.key === 'PK') return idx;
        if (name.indexOf('email') >= 0) return this._pick(this.fakeData.first_names).toLowerCase() + idx + '@' + this._pick(this.fakeData.domains);
        if (name.indexOf('first_name') >= 0 || name === 'first_name') return this._pick(this.fakeData.first_names);
        if (name.indexOf('last_name') >= 0 || name === 'last_name') return this._pick(this.fakeData.last_names);
        if (name.indexOf('name') >= 0 && name.indexOf('user') >= 0) return this._pick(this.fakeData.first_names).toLowerCase() + '_' + idx;
        if (name.indexOf('full_name') >= 0 || name === 'name') return this._pick(this.fakeData.first_names) + ' ' + this._pick(this.fakeData.last_names);
        if (name.indexOf('status') >= 0) return this._pick(this.fakeData.statuses);
        if (name.indexOf('city') >= 0 || name.indexOf('location') >= 0) return this._pick(this.fakeData.cities);
        if (name.indexOf('category') >= 0) return this._pick(this.fakeData.categories);
        if (name.indexOf('password') >= 0 || name.indexOf('hash') >= 0) return '$2b$10...' + Math.random().toString(36).substring(7);
        if (name.indexOf('_id') >= 0 || name.indexOf('_fk') >= 0) return Math.floor(Math.random() * 5) + 1;
        if (name.indexOf('price') >= 0 || name.indexOf('amount') >= 0 || name.indexOf('salary') >= 0) return (Math.random() * 1000 + 10).toFixed(2);
        if (name.indexOf('age') >= 0 || name.indexOf('count') >= 0 || name.indexOf('stock') >= 0) return Math.floor(Math.random() * 200) + 1;
        if (name.indexOf('date') >= 0 || name.indexOf('_at') >= 0) return '2024-' + String(Math.floor(Math.random() * 12) + 1).padStart(2, '0') + '-' + String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
        if (name.indexOf('role') >= 0) return this._pick(['admin', 'user', 'editor', 'viewer']);
        if (type.indexOf('int') >= 0 || type.indexOf('serial') >= 0 || type.indexOf('number') >= 0) return Math.floor(Math.random() * 1000);
        if (type.indexOf('decimal') >= 0 || type.indexOf('numeric') >= 0 || type.indexOf('float') >= 0) return (Math.random() * 100).toFixed(2);
        if (type.indexOf('bool') >= 0) return Math.random() > 0.5;
        return 'value_' + idx;
    },

    _pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; }
};
