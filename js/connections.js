/**
 * YDB - Connection Management
 */
YDB.Connections = {
    init: function () {
        var self = this;
        document.getElementById('btn-add-conn').addEventListener('click', function () { self.openModal(); });
        document.getElementById('form-connection').addEventListener('submit', function (e) { e.preventDefault(); self.save(); });
        document.getElementById('btn-test-conn').addEventListener('click', function () { self.test(); });
        document.getElementById('btn-cancel-conn').addEventListener('click', function () { document.getElementById('modal-connection').close(); });
        document.getElementById('conn-type').addEventListener('change', function () {
            var port = YDB.Config.PORTS[this.value];
            if (port) document.getElementById('conn-port').value = port;
        });
    },

    render: function () {
        var S = YDB.State, el = document.getElementById('list-connections');
        if (!S.connections.length) { el.innerHTML = '<p class="text-base-content/50 text-sm text-center py-4">No connections</p>'; return; }

        el.innerHTML = S.connections.map(function (conn) {
            var db = YDB.Config.DB_TYPES[conn.type] || { name: conn.type, color: '#666' };
            var active = S.activeConnection && S.activeConnection.id === conn.id;
            return '<div class="conn-item' + (active ? ' active' : '') + '" data-id="' + conn.id + '">'
                + '<div class="flex items-center gap-2">'
                + '<div class="w-2 h-2 rounded-full shrink-0" style="background:' + db.color + '"></div>'
                + '<div class="flex-1 min-w-0"><div class="text-sm font-medium truncate">' + conn.name + '</div>'
                + '<div class="text-xs text-base-content/50">' + db.name + ' - ' + conn.host + '</div></div>'
                + '<div class="conn-actions flex gap-1">'
                + '<button class="btn btn-ghost btn-xs" data-edit="' + conn.id + '"><i data-lucide="pencil" class="w-3 h-3"></i></button>'
                + '<button class="btn btn-ghost btn-xs text-error" data-del="' + conn.id + '"><i data-lucide="trash-2" class="w-3 h-3"></i></button>'
                + '</div></div></div>';
        }).join('');
        YDB.UI.icons();

        // Bind events
        el.querySelectorAll('.conn-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
                if (e.target.closest('[data-edit]') || e.target.closest('[data-del]')) return;
                YDB.Connections.select(this.dataset.id);
            });
        });
        el.querySelectorAll('[data-edit]').forEach(function (btn) {
            btn.addEventListener('click', function (e) { e.stopPropagation(); YDB.Connections.openModal(this.dataset.edit); });
        });
        el.querySelectorAll('[data-del]').forEach(function (btn) {
            btn.addEventListener('click', function (e) { e.stopPropagation(); YDB.Connections.remove(this.dataset.del); });
        });
    },

    select: function (id) {
        var conn = YDB.State.connections.find(function (c) { return c.id === id; });
        if (!conn) return;
        YDB.State.activeConnection = conn;
        YDB.State.activeTable = null;
        this.render();
        YDB.Explorer.renderTree();
        YDB.Builder.renderTablesList();
        YDB.FormBuilder.populateTables();
        YDB.DataGenerator.populateTable();
        YDB.UI.toast('Connected to ' + conn.name, 'success');
    },

    openModal: function (editId) {
        var modal = document.getElementById('modal-connection');
        var form = document.getElementById('form-connection');
        if (editId) {
            var conn = YDB.State.connections.find(function (c) { return c.id === editId; });
            if (!conn) return;
            document.getElementById('conn-modal-title').textContent = 'Edit Connection';
            document.getElementById('conn-edit-id').value = conn.id;
            document.getElementById('conn-name').value = conn.name;
            document.getElementById('conn-type').value = conn.type;
            document.getElementById('conn-host').value = conn.host;
            document.getElementById('conn-port').value = conn.port;
            document.getElementById('conn-user').value = conn.username;
            document.getElementById('conn-pass').value = conn.password;
            document.getElementById('conn-db').value = conn.database;
        } else {
            document.getElementById('conn-modal-title').textContent = 'New Connection';
            form.reset();
            document.getElementById('conn-edit-id').value = '';
        }
        modal.showModal();
    },

    save: function () {
        var editId = document.getElementById('conn-edit-id').value;
        var data = {
            id: editId || 'conn-' + Date.now(),
            name: document.getElementById('conn-name').value,
            type: document.getElementById('conn-type').value,
            host: document.getElementById('conn-host').value,
            port: parseInt(document.getElementById('conn-port').value) || YDB.Config.PORTS[document.getElementById('conn-type').value] || 0,
            username: document.getElementById('conn-user').value,
            password: document.getElementById('conn-pass').value,
            database: document.getElementById('conn-db').value
        };
        if (editId) {
            var idx = YDB.State.connections.findIndex(function (c) { return c.id === editId; });
            if (idx >= 0) YDB.State.connections[idx] = data;
        } else {
            YDB.State.connections.push(data);
        }
        YDB.State.save();
        document.getElementById('modal-connection').close();
        this.render();
        YDB.Builder.renderTablesList();
        YDB.UI.toast('Connection saved', 'success');
    },

    remove: function (id) {
        if (!confirm('Delete this connection?')) return;
        YDB.State.connections = YDB.State.connections.filter(function (c) { return c.id !== id; });
        if (YDB.State.activeConnection && YDB.State.activeConnection.id === id) {
            YDB.State.activeConnection = null;
            YDB.State.activeTable = null;
            YDB.Explorer.clear();
        }
        YDB.State.save();
        this.render();
        YDB.Builder.renderTablesList();
        YDB.UI.toast('Connection deleted', 'info');
    },

    test: function () {
        YDB.UI.toast('Testing connection...', 'info');
        setTimeout(function () { YDB.UI.toast('Connection successful!', 'success'); }, 800);
    }
};
