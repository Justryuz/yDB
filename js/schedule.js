/**
 * YDB - Scheduled Queries / Cron
 * Set queries to run on schedule (mock implementation).
 */
YDB.Schedule = {
    schedules: [],

    init: function () {
        var self = this;
        document.getElementById('btn-add-schedule').addEventListener('click', function () { self.add(); });
        this._load();
    },

    _load: function () {
        var d = localStorage.getItem('ydb-schedules');
        this.schedules = d ? JSON.parse(d) : [];
    },

    _save: function () {
        localStorage.setItem('ydb-schedules', JSON.stringify(this.schedules));
    },

    populateConnections: function () {
        var sel = document.getElementById('sched-conn');
        sel.innerHTML = YDB.State.connections.map(function (c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
    },

    open: function () {
        this.populateConnections();
        this.render();
        document.getElementById('modal-schedule').showModal();
    },

    add: function () {
        var name = document.getElementById('sched-name').value.trim();
        var sql = document.getElementById('sched-sql').value.trim();
        var interval = document.getElementById('sched-interval').value;
        var connId = document.getElementById('sched-conn').value;

        if (!name || !sql) { YDB.UI.toast('Fill name and SQL', 'warning'); return; }

        this.schedules.push({
            id: Date.now(), name: name, sql: sql, interval: interval, connId: connId,
            active: true, lastRun: null, created: new Date().toISOString()
        });
        this._save();
        this.render();
        document.getElementById('sched-name').value = '';
        document.getElementById('sched-sql').value = '';
        YDB.UI.toast('Schedule created', 'success');
    },

    remove: function (id) {
        this.schedules = this.schedules.filter(function (s) { return s.id !== id; });
        this._save();
        this.render();
    },

    toggle: function (id) {
        var s = this.schedules.find(function (x) { return x.id === id; });
        if (s) { s.active = !s.active; this._save(); this.render(); }
    },

    render: function () {
        var el = document.getElementById('schedule-list');
        if (!this.schedules.length) { el.innerHTML = '<p class="text-xs text-base-content/40 text-center">No schedules</p>'; return; }

        el.innerHTML = this.schedules.map(function (s) {
            var conn = YDB.State.connections.find(function (c) { return c.id === s.connId; });
            return '<div class="flex items-center gap-2 p-2 border border-base-300 rounded mb-2">'
                + '<input type="checkbox" class="toggle toggle-xs toggle-primary" ' + (s.active ? 'checked' : '') + ' onchange="YDB.Schedule.toggle(' + s.id + ')">'
                + '<div class="flex-1 min-w-0"><div class="text-xs font-semibold truncate">' + s.name + '</div>'
                + '<div class="text-xs text-base-content/50">' + s.interval + ' | ' + (conn ? conn.name : '?') + '</div></div>'
                + '<button class="btn btn-ghost btn-xs text-error" onclick="YDB.Schedule.remove(' + s.id + ')"><i data-lucide="trash-2" class="w-3 h-3"></i></button>'
                + '</div>';
        }).join('');
        YDB.UI.icons();
    }
};
