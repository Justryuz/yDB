/**
 * YDB - User Management
 * Roles, access control (mock implementation).
 */
YDB.Users = {
    users: [],
    roles: ['admin', 'editor', 'viewer'],

    init: function () {
        this._load();
        var self = this;
        document.getElementById('btn-add-user').addEventListener('click', function () { self.addUser(); });
    },

    _load: function () {
        var d = localStorage.getItem('ydb-users');
        this.users = d ? JSON.parse(d) : [
            { id: 1, username: 'admin', email: 'admin@ydb.io', role: 'admin', active: true, created: '2024-01-01' },
            { id: 2, username: 'developer', email: 'dev@ydb.io', role: 'editor', active: true, created: '2024-03-15' },
            { id: 3, username: 'analyst', email: 'analyst@ydb.io', role: 'viewer', active: true, created: '2024-05-01' }
        ];
    },

    _save: function () { localStorage.setItem('ydb-users', JSON.stringify(this.users)); },

    addUser: function () {
        var name = document.getElementById('new-user-name').value.trim();
        var email = document.getElementById('new-user-email').value.trim();
        var role = document.getElementById('new-user-role').value;
        if (!name || !email) { YDB.UI.toast('Fill name and email', 'warning'); return; }

        this.users.push({ id: Date.now(), username: name, email: email, role: role, active: true, created: new Date().toISOString().split('T')[0] });
        this._save();
        this.render();
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-email').value = '';
        YDB.UI.toast('User added', 'success');
    },

    toggleUser: function (id) {
        var u = this.users.find(function (x) { return x.id === id; });
        if (u) { u.active = !u.active; this._save(); this.render(); }
    },

    removeUser: function (id) {
        if (!confirm('Remove this user?')) return;
        this.users = this.users.filter(function (x) { return x.id !== id; });
        this._save(); this.render();
    },

    render: function () {
        var el = document.getElementById('users-list');
        var h = '<table class="data-table w-full"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
        this.users.forEach(function (u) {
            var badge = u.active ? 'badge-success' : 'badge-ghost';
            h += '<tr><td class="font-medium">' + u.username + '</td><td>' + u.email + '</td>';
            h += '<td><span class="badge badge-xs badge-primary">' + u.role + '</span></td>';
            h += '<td><span class="badge badge-xs ' + badge + '">' + (u.active ? 'Active' : 'Disabled') + '</span></td>';
            h += '<td><button class="btn btn-ghost btn-xs" onclick="YDB.Users.toggleUser(' + u.id + ')"><i data-lucide="power" class="w-3 h-3"></i></button>';
            h += '<button class="btn btn-ghost btn-xs text-error" onclick="YDB.Users.removeUser(' + u.id + ')"><i data-lucide="trash-2" class="w-3 h-3"></i></button></td></tr>';
        });
        h += '</tbody></table>';
        el.innerHTML = h;
        YDB.UI.icons();
    }
};
