/**
 * YDB - Plugins/Extensions Architecture
 * Register, enable/disable, and manage third-party add-ons.
 */
YDB.Plugins = {
    installed: [],
    registry: [
        { id: 'redis-viewer', name: 'Redis Key Viewer', author: 'yDB Community', version: '1.0.0', description: 'Browse Redis keys with TTL and type info', category: 'Database', installed: false },
        { id: 'sql-formatter', name: 'SQL Beautifier Pro', author: 'yDB Labs', version: '2.1.0', description: 'Advanced SQL formatting with multiple styles', category: 'Editor', installed: true },
        { id: 'data-faker', name: 'Advanced Data Faker', author: 'Community', version: '1.3.0', description: 'Generate realistic fake data with 50+ providers', category: 'Tools', installed: false },
        { id: 'er-diagram-export', name: 'ERD Export (PNG/SVG)', author: 'yDB Labs', version: '1.0.0', description: 'Export ERD diagrams as high-res images', category: 'Export', installed: true },
        { id: 'query-optimizer', name: 'Query Optimizer', author: 'Performance Co', version: '3.0.0', description: 'AI-powered query optimization suggestions', category: 'Performance', installed: false },
        { id: 'dark-themes', name: 'Theme Pack', author: 'yDB Community', version: '1.5.0', description: '10 additional dark/light themes', category: 'UI', installed: false },
        { id: 'mongo-shell', name: 'MongoDB Shell', author: 'NoSQL Tools', version: '2.0.0', description: 'Native MongoDB query syntax support', category: 'Database', installed: false },
        { id: 'csv-pro', name: 'CSV Pro Importer', author: 'Data Tools', version: '1.2.0', description: 'Advanced CSV parsing with encoding detection', category: 'Import', installed: true }
    ],

    init: function () {
        this._load();
    },

    _load: function () {
        var d = localStorage.getItem('ydb-plugins');
        if (d) {
            var installed = JSON.parse(d);
            this.registry.forEach(function (p) { p.installed = installed.indexOf(p.id) >= 0; });
        }
        this.installed = this.registry.filter(function (p) { return p.installed; });
    },

    _save: function () {
        var ids = this.registry.filter(function (p) { return p.installed; }).map(function (p) { return p.id; });
        localStorage.setItem('ydb-plugins', JSON.stringify(ids));
        this.installed = this.registry.filter(function (p) { return p.installed; });
    },

    install: function (id) {
        var p = this.registry.find(function (x) { return x.id === id; });
        if (p) { p.installed = true; this._save(); this.render(); YDB.UI.toast(p.name + ' installed', 'success'); }
    },

    uninstall: function (id) {
        var p = this.registry.find(function (x) { return x.id === id; });
        if (p) { p.installed = false; this._save(); this.render(); YDB.UI.toast(p.name + ' removed', 'info'); }
    },

    render: function () {
        var el = document.getElementById('plugins-list');
        var categories = {};
        this.registry.forEach(function (p) { if (!categories[p.category]) categories[p.category] = []; categories[p.category].push(p); });

        var h = '';
        Object.keys(categories).forEach(function (cat) {
            h += '<div class="mb-4"><div class="text-xs font-semibold text-base-content/60 mb-2">' + cat + '</div>';
            categories[cat].forEach(function (p) {
                h += '<div class="flex items-center gap-3 p-3 border border-base-300 rounded-lg mb-2">';
                h += '<div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center"><i data-lucide="puzzle" class="w-5 h-5 text-primary"></i></div>';
                h += '<div class="flex-1"><div class="text-sm font-medium">' + p.name + ' <span class="text-xs text-base-content/40">v' + p.version + '</span></div>';
                h += '<div class="text-xs text-base-content/50">' + p.description + '</div>';
                h += '<div class="text-xs text-base-content/40 mt-0.5">by ' + p.author + '</div></div>';
                if (p.installed) {
                    h += '<button class="btn btn-ghost btn-xs text-error" onclick="YDB.Plugins.uninstall(\'' + p.id + '\')">Uninstall</button>';
                    h += '<span class="badge badge-xs badge-success">Installed</span>';
                } else {
                    h += '<button class="btn btn-primary btn-xs" onclick="YDB.Plugins.install(\'' + p.id + '\')">Install</button>';
                }
                h += '</div>';
            });
            h += '</div>';
        });
        el.innerHTML = h;
        YDB.UI.icons();
    }
};
