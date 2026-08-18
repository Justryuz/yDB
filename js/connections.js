/**
 * @file connections.js
 * @description Connection management — CRUD with API support.
 * Uses API when online, localStorage when offline.
 * @module YDB.Connections
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

        // SSH tunnel toggle
        document.getElementById('conn-ssh-enabled').addEventListener('change', function () {
            document.getElementById('ssh-fields').classList.toggle('hidden', !this.checked);
        });
        document.getElementById('conn-ssh-auth').addEventListener('change', function () {
            document.getElementById('ssh-password-field').classList.toggle('hidden', this.value === 'key');
            document.getElementById('ssh-key-field').classList.toggle('hidden', this.value !== 'key');
        });
    },

    /**
     * Load and render connections. Uses API if online, localStorage if offline.
     */
    render: function () {
        var self = this;
        if (YDB.API.isOnline() && YDB.API.token) {
            YDB.API.get('/connections').then(function (conns) {
                YDB.State.connections = conns.map(function (c) {
                    return { id: c.id, name: c.name, type: c.db_type, host: c.host, port: c.port, username: c.username, password: '', database: c.database_name };
                });
                self._renderList();
            }).catch(function () { self._renderList(); });
        } else {
            this._renderList();
        }
    },

    _renderList: function () {
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
        var self = this;
        var editId = document.getElementById('conn-edit-id').value;
        var data = {
            name: document.getElementById('conn-name').value,
            db_type: document.getElementById('conn-type').value,
            host: document.getElementById('conn-host').value,
            port: parseInt(document.getElementById('conn-port').value) || YDB.Config.PORTS[document.getElementById('conn-type').value] || 0,
            username: document.getElementById('conn-user').value,
            password: document.getElementById('conn-pass').value,
            database_name: document.getElementById('conn-db').value,
            options: {}
        };

        // SSH tunnel options
        if (document.getElementById('conn-ssh-enabled').checked) {
            data.options.ssh = {
                enabled: true,
                host: document.getElementById('conn-ssh-host').value,
                port: parseInt(document.getElementById('conn-ssh-port').value) || 22,
                username: document.getElementById('conn-ssh-user').value,
                authMethod: document.getElementById('conn-ssh-auth').value,
                password: document.getElementById('conn-ssh-pass').value,
                privateKey: document.getElementById('conn-ssh-key').value
            };
        }

        var done = function () {
            document.getElementById('modal-connection').close();
            self.render();
            YDB.Builder.renderTablesList();
            YDB.UI.toast('Connection saved', 'success');
        };

        if (YDB.API.isOnline() && YDB.API.token) {
            var req = editId ? YDB.API.put('/connections/' + editId, data) : YDB.API.post('/connections', data);
            req.then(done).catch(function (err) { YDB.UI.toast(err.message, 'error'); });
        } else {
            // Offline mode — save to localStorage
            var localData = { id: editId || 'conn-' + Date.now(), name: data.name, type: data.db_type, host: data.host, port: data.port, username: data.username, password: data.password, database: data.database_name };
            if (editId) {
                var idx = YDB.State.connections.findIndex(function (c) { return c.id === editId; });
                if (idx >= 0) YDB.State.connections[idx] = localData;
            } else {
                YDB.State.connections.push(localData);
            }
            YDB.State.save();
            done();
        }
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
        var connId = document.getElementById('conn-edit-id').value;
        YDB.UI.toast('Testing connection...', 'info');

        if (YDB.API.isOnline() && YDB.API.token && connId) {
            YDB.API.post('/connections/' + connId + '/test', {}).then(function (res) {
                YDB.UI.toast(res.message, res.success ? 'success' : 'error');
            }).catch(function (err) { YDB.UI.toast(err.message, 'error'); });
        } else {
            setTimeout(function () { YDB.UI.toast('Connection successful! (mock)', 'success'); }, 800);
        }
    }
};
