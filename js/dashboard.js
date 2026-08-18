/**
 * YDB - Dashboard
 * Pin charts/queries, view multiple widgets.
 */
YDB.Dashboard = {
    widgets: [],

    init: function () {
        this._load();
        document.getElementById('btn-clear-dashboard').addEventListener('click', function () {
            if (confirm('Clear all dashboard widgets?')) { YDB.Dashboard.widgets = []; YDB.Dashboard._save(); YDB.Dashboard.render(); }
        });
    },

    _load: function () {
        var d = localStorage.getItem('ydb-dashboard');
        this.widgets = d ? JSON.parse(d) : [];
    },

    _save: function () {
        localStorage.setItem('ydb-dashboard', JSON.stringify(this.widgets));
    },

    addWidget: function (widget) {
        widget.id = Date.now();
        widget.created = new Date().toISOString();
        this.widgets.push(widget);
        this._save();
        this.render();
        YDB.UI.toast('Added to dashboard', 'success');
    },

    removeWidget: function (id) {
        this.widgets = this.widgets.filter(function (w) { return w.id !== id; });
        this._save();
        this.render();
    },

    render: function () {
        var el = document.getElementById('dashboard-grid');
        if (!this.widgets.length) {
            el.innerHTML = '<p class="text-base-content/40 text-center col-span-full mt-10">No widgets. Generate charts and pin them here.</p>';
            return;
        }

        el.innerHTML = this.widgets.map(function (w) {
            var h = '<div class="border border-base-300 rounded-lg bg-base-100 p-3">';
            h += '<div class="flex items-center justify-between mb-2">';
            h += '<span class="text-sm font-semibold">' + w.name + '</span>';
            h += '<button class="btn btn-ghost btn-xs text-error" onclick="YDB.Dashboard.removeWidget(' + w.id + ')"><i data-lucide="x" class="w-3 h-3"></i></button>';
            h += '</div>';
            if (w.type === 'chart') {
                h += '<canvas id="dash-chart-' + w.id + '" height="150"></canvas>';
            } else if (w.type === 'query') {
                h += '<pre class="text-xs font-mono text-primary">' + (w.sql || '') + '</pre>';
            }
            h += '<div class="text-xs text-base-content/40 mt-2">' + new Date(w.created).toLocaleDateString() + '</div>';
            h += '</div>';
            return h;
        }).join('');
        YDB.UI.icons();

        // Render mini charts
        var self = this;
        setTimeout(function () {
            self.widgets.forEach(function (w) {
                if (w.type === 'chart' && w.data) {
                    var canvas = document.getElementById('dash-chart-' + w.id);
                    if (canvas) {
                        new Chart(canvas.getContext('2d'), {
                            type: w.chartType || 'bar',
                            data: w.data,
                            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
                        });
                    }
                }
            });
        }, 100);
    }
};
