/**
 * @file ui.js
 * @description Shared UI utilities: theme, toasts, tabs, resizable panels, paginated tables.
 * @module YDB.UI
 */

YDB.UI = {

    // ══════════════════════════════════════════════════════════
    // TOAST NOTIFICATIONS
    // ══════════════════════════════════════════════════════════

    /**
     * Show a toast notification.
     * @param {string} msg - Message text
     * @param {string} type - 'success' | 'error' | 'warning' | 'info'
     */
    toast: function (msg, type) {
        var classes = { success: 'alert-success', error: 'alert-error', warning: 'alert-warning', info: 'alert-info' };
        var el = document.createElement('div');
        el.className = 'alert ' + (classes[type] || 'alert-info') + ' text-sm shadow-lg';
        el.innerHTML = '<span>' + msg + '</span>';
        document.getElementById('toast-container').appendChild(el);
        setTimeout(function () { el.remove(); }, YDB.Config.TOAST_DURATION);
    },

    // ══════════════════════════════════════════════════════════
    // THEME
    // ══════════════════════════════════════════════════════════

    /**
     * Initialize dark/light theme from saved preference.
     */
    initTheme: function () {
        document.documentElement.setAttribute('data-theme', YDB.State.theme);
        var toggle = document.getElementById('toggle-theme');
        if (YDB.State.theme === 'light') toggle.checked = true;

        toggle.addEventListener('change', function () {
            YDB.State.theme = YDB.State.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', YDB.State.theme);
            localStorage.setItem('ydb-theme', YDB.State.theme);
        });
    },

    // ══════════════════════════════════════════════════════════
    // TAB NAVIGATION
    // ══════════════════════════════════════════════════════════

    /**
     * Initialize main tab navigation. Binds click events to tab buttons.
     */
    initTabs: function () {
        var self = this;
        document.querySelectorAll('#main-tabs .tab').forEach(function (tab) {
            tab.addEventListener('click', function (e) {
                e.preventDefault();
                self.switchTab(this.dataset.tab);
            });
        });
        this.switchTab('explorer');
    },

    /**
     * Switch to a named tab. Shows matching panel, hides others.
     * @param {string} name - Tab identifier (matches data-tab and panel id="tab-{name}")
     */
    switchTab: function (name) {
        YDB.State.activeTab = name;

        // Update tab button states
        document.querySelectorAll('#main-tabs .tab').forEach(function (t) {
            if (t.dataset.tab === name) t.classList.add('tab-active');
            else t.classList.remove('tab-active');
        });

        // Show/hide panels
        document.querySelectorAll('.tab-panel').forEach(function (p) {
            if (p.id === 'tab-' + name) p.classList.add('active');
            else p.classList.remove('active');
        });

        // Refresh data on certain tabs
        if (name === 'form' && YDB.FormBuilder) YDB.FormBuilder.populateTables();
        if (name === 'charts' && YDB.Charts) YDB.Charts.populateColumns();
        if (name === 'templates' && YDB.Templates) YDB.Templates.render();
        if (name === 'dashboard' && YDB.Dashboard) YDB.Dashboard.render();
    },

    // ══════════════════════════════════════════════════════════
    // RESIZABLE PANELS
    // ══════════════════════════════════════════════════════════

    /**
     * Initialize all resizable panel handles (vertical + horizontal).
     * Uses event delegation pattern — only added once.
     */
    initResize: function () {
        this._initVerticalHandles();
        this._initHorizontalHandles();
    },

    /** @private Vertical (left/right) resize handles */
    _initVerticalHandles: function () {
        document.querySelectorAll('.resize-handle-v').forEach(function (handle) {
            var target = document.getElementById(handle.dataset.resize);
            if (!target) return;
            var dir = handle.dataset.dir || 'left';
            var dragging = false, startX, startW;

            handle.addEventListener('mousedown', function (e) {
                dragging = true;
                startX = e.clientX;
                startW = target.offsetWidth;
                handle.classList.add('active');
                document.body.style.cursor = 'ew-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            document.addEventListener('mousemove', function (e) {
                if (!dragging) return;
                var dx = e.clientX - startX;
                var w = dir === 'right' ? startW - dx : startW + dx;
                var min = parseInt(target.style.minWidth) || 100;
                var max = window.innerWidth * 0.45;
                target.style.width = Math.max(min, Math.min(max, w)) + 'px';
            });

            document.addEventListener('mouseup', function () {
                if (!dragging) return;
                dragging = false;
                handle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            });
        });
    },

    /** @private Horizontal (up/down) resize handles */
    _initHorizontalHandles: function () {
        document.querySelectorAll('.resize-handle-h').forEach(function (handle) {
            var panel = handle.nextElementSibling;
            if (!panel) return;
            var dragging = false, startY, startH;

            handle.addEventListener('mousedown', function (e) {
                dragging = true;
                startY = e.clientY;
                startH = panel.offsetHeight;
                handle.classList.add('active');
                document.body.style.cursor = 'ns-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            document.addEventListener('mousemove', function (e) {
                if (!dragging) return;
                var h = startH + (startY - e.clientY);
                var min = parseInt(panel.style.minHeight) || 80;
                var max = window.innerHeight * 0.75;
                panel.style.height = Math.max(min, Math.min(max, h)) + 'px';
            });

            document.addEventListener('mouseup', function () {
                if (!dragging) return;
                dragging = false;
                handle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            });
        });
    },

    // ══════════════════════════════════════════════════════════
    // PAGINATED TABLE RENDERER
    // ══════════════════════════════════════════════════════════

    /**
     * Render a paginated data table into a container.
     * @param {string} containerId - DOM element ID to render into
     * @param {string[]} columns - Column keys for data access
     * @param {string[]} columnHeaders - Display headers (can include HTML)
     * @param {Object[]} data - Array of row objects
     */
    renderTable: function (containerId, columns, columnHeaders, data) {
        var pag = YDB.State.pagination;
        if (!pag[containerId]) {
            pag[containerId] = { page: 1, perPage: YDB.Config.DEFAULT_PER_PAGE };
        }
        var p = pag[containerId];
        p.page = 1;
        p.columns = columns;
        p.headers = columnHeaders;
        p.data = data;
        this._renderPage(containerId);
    },

    /**
     * Render current page of a paginated table.
     * @param {string} id - Container element ID
     */
    _renderPage: function (id) {
        var p = YDB.State.pagination[id];
        if (!p || !p.data) return;

        var total = p.data.length;
        var pages = Math.max(1, Math.ceil(total / p.perPage));
        p.page = Math.max(1, Math.min(p.page, pages));

        var start = (p.page - 1) * p.perPage;
        var end = Math.min(start + p.perPage, total);
        var rows = p.data.slice(start, end);

        // Build HTML
        var h = '<div class="overflow-x-auto"><table class="data-table"><thead><tr>';
        p.headers.forEach(function (c) { h += '<th>' + c + '</th>'; });
        h += '</tr></thead><tbody>';

        rows.forEach(function (row) {
            h += '<tr>';
            p.columns.forEach(function (c) {
                var v = row[c];
                h += (v === null || v === undefined)
                    ? '<td class="text-base-content/30 italic">NULL</td>'
                    : '<td>' + v + '</td>';
            });
            h += '</tr>';
        });
        h += '</tbody></table></div>';

        // Pagination controls
        h += '<div class="flex items-center justify-between mt-2 px-1 text-xs">';
        h += '<div class="flex items-center gap-2">';
        h += '<span class="text-base-content/50">Rows ' + (start + 1) + '-' + end + ' of ' + total + '</span>';
        h += '<select class="select select-xs select-bordered" onchange="YDB.UI.setPerPage(\'' + id + '\',this.value)">';
        [10, 25, 50, 100].forEach(function (n) {
            h += '<option value="' + n + '"' + (n === p.perPage ? ' selected' : '') + '>' + n + '</option>';
        });
        h += '</select></div>';
        h += '<div class="join">';
        h += '<button class="join-item btn btn-xs"' + (p.page <= 1 ? ' disabled' : '') + ' onclick="YDB.UI.goPage(\'' + id + '\',1)">&laquo;</button>';
        h += '<button class="join-item btn btn-xs"' + (p.page <= 1 ? ' disabled' : '') + ' onclick="YDB.UI.goPage(\'' + id + '\',' + (p.page - 1) + ')">&lsaquo;</button>';
        h += '<span class="join-item btn btn-xs btn-disabled">' + p.page + '/' + pages + '</span>';
        h += '<button class="join-item btn btn-xs"' + (p.page >= pages ? ' disabled' : '') + ' onclick="YDB.UI.goPage(\'' + id + '\',' + (p.page + 1) + ')">&rsaquo;</button>';
        h += '<button class="join-item btn btn-xs"' + (p.page >= pages ? ' disabled' : '') + ' onclick="YDB.UI.goPage(\'' + id + '\',' + pages + ')">&raquo;</button>';
        h += '</div></div>';

        document.getElementById(id).innerHTML = h;
    },

    /**
     * Navigate to a specific page.
     * @param {string} id - Container ID
     * @param {number} pg - Page number
     */
    goPage: function (id, pg) {
        YDB.State.pagination[id].page = pg;
        this._renderPage(id);
    },

    /**
     * Change rows per page.
     * @param {string} id - Container ID
     * @param {string|number} val - New per-page value
     */
    setPerPage: function (id, val) {
        var p = YDB.State.pagination[id];
        p.perPage = parseInt(val);
        p.page = 1;
        this._renderPage(id);
    },

    // ══════════════════════════════════════════════════════════
    // DATA ACCESS
    // ══════════════════════════════════════════════════════════

    /**
     * Get raw data from a rendered paginated table.
     * @param {string} containerId - Container element ID
     * @returns {{columns: string[], data: Object[]}|null}
     */
    getResultsData: function (containerId) {
        var p = YDB.State.pagination[containerId];
        if (!p || !p.data) return null;
        return { columns: p.columns, data: p.data };
    },

    // ══════════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════════

    /** Refresh all Lucide icons in the DOM. */
    icons: function () { lucide.createIcons(); },

    /**
     * HTML-escape a string to prevent XSS.
     * @param {string} s - Raw string
     * @returns {string} Escaped string
     */
    esc: function (s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    },

    /**
     * XML-escape a string for Excel export.
     * @param {string} s - Raw string
     * @returns {string} Escaped string
     */
    escXml: function (s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
};
