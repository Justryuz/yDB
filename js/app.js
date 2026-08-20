/**
 * @file app.js
 * @description Application entry point. Initializes all modules on DOMContentLoaded.
 * @module YDB.App
 *
 * Load order matters — this file must be the LAST script loaded.
 * All modules are initialized in dependency order:
 *   1. State (load persisted data)
 *   2. UI (theme, tabs, resize)
 *   3. Auth (login flow)
 *   4. Core modules (connections, explorer, builder, editor)
 *   5. Feature modules (filtering, autocomplete, export, etc.)
 *   6. Admin modules (users, audit, backup, etc.)
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {

        // ── 1. State ──────────────────────────────────────────
        YDB.State.load();

        // ── 1.5. API Client ──────────────────────────────────
        YDB.API.init();

        // ── 2. UI Foundation ──────────────────────────────────
        YDB.UI.initTheme();
        YDB.UI.initTabs();
        YDB.UI.initResize();

        // ── 3. Auth ───────────────────────────────────────────
        YDB.Auth.init();

        // ── 4. Core Modules ───────────────────────────────────
        YDB.Connections.init();
        YDB.Explorer.init();
        YDB.Builder.init();
        YDB.SQLEditor.init();
        YDB.History.init();

        // ── 5. Feature Modules ────────────────────────────────
        YDB.DataEditor.init();
        YDB.DDLViewer.init();
        YDB.ERD.init();
        YDB.StructureEditor.init();
        YDB.SavedQueries.init();
        YDB.Autocomplete.init();
        YDB.Explain.init();
        YDB.Filtering.init();
        YDB.Compare.init();
        YDB.Import.init();
        YDB.Schedule.init();
        YDB.Diff.init();
        YDB.Masking.init();
        YDB.Collab.init();
        YDB.Charts.init();
        YDB.Dashboard.init();
        YDB.Templates.init();
        YDB.FormBuilder.init();
        YDB.Terminal.init();

        // ── 6. Admin Modules ──────────────────────────────────
        YDB.DataGenerator.init();
        YDB.Migration.init();
        YDB.Audit.init();
        YDB.Users.init();
        YDB.Backup.init();
        YDB.StoredProcs.init();
        YDB.Notifications.init();
        YDB.Plugins.init();
        YDB.APIClient.init();

        // ── 7. Admin Sub-tab Navigation ───────────────────────
        _initAdminSubtabs();

        // ── 8. Render Icons ───────────────────────────────────
        YDB.UI.icons();
    });

    /**
     * Initialize the admin panel's sub-tab switching.
     * @private
     */
    function _initAdminSubtabs() {
        var tabs = document.querySelectorAll('#admin-subtabs .tab');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                // Toggle active tab button
                tabs.forEach(function (t) { t.classList.remove('tab-active'); });
                this.classList.add('tab-active');

                // Show/hide sub-panels
                var sub = this.dataset.subtab;
                document.querySelectorAll('.admin-sub').forEach(function (el) {
                    el.style.display = 'none';
                    el.classList.remove('active');
                });
                var target = document.getElementById('sub-' + sub);
                if (target) {
                    target.style.display = 'block';
                    target.classList.add('active');
                }

                // Populate content on switch
                var populators = {
                    users: function () { YDB.Users.render(); },
                    audit: function () { YDB.Audit.render(); },
                    generator: function () { YDB.DataGenerator.populateTable(); },
                    migration: function () { YDB.Migration.populateSelects(); },
                    procs: function () { YDB.StoredProcs.render(); },
                    notifications: function () { YDB.Notifications.render(); },
                    plugins: function () { YDB.Plugins.render(); }
                };
                if (populators[sub]) populators[sub]();
            });
        });
    }

})();
