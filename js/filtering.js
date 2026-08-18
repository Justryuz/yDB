/**
 * YDB - Data Filtering & Sorting
 * Click column headers to sort, filter rows via input.
 * Uses event delegation to prevent listener accumulation.
 */
YDB.Filtering = {
    _state: {}, // Per-container state: { sortCol, sortDir, filterValue, origData }

    init: function () {},

    _getState: function (id) {
        if (!this._state[id]) this._state[id] = { sortCol: null, sortDir: 'asc', filterValue: '' };
        return this._state[id];
    },

    /**
     * Enhance a paginated table with sort/filter.
     * Safe to call multiple times — uses event delegation.
     */
    enhance: function (containerId) {
        var self = this;
        var container = document.getElementById(containerId);
        if (!container) return;

        // Add filter bar only once
        if (!container.querySelector('.filter-bar')) {
            var bar = document.createElement('div');
            bar.className = 'filter-bar flex items-center gap-2 mb-2';
            bar.innerHTML = '<input type="text" class="input input-xs input-bordered flex-1" placeholder="Filter rows...">'
                + '<button class="btn btn-ghost btn-xs">&times;</button>';
            container.insertBefore(bar, container.firstChild);

            // Event delegation on filter bar
            bar.querySelector('input').addEventListener('input', function () {
                var s = self._getState(containerId);
                s.filterValue = this.value.toLowerCase();
                self._applyFilter(containerId);
            });
            bar.querySelector('button').addEventListener('click', function () {
                bar.querySelector('input').value = '';
                var s = self._getState(containerId);
                s.filterValue = '';
                self._applyFilter(containerId);
            });
        }

        // Use event delegation for sort headers (one listener on container)
        if (!container._sortBound) {
            container._sortBound = true;
            container.addEventListener('click', function (e) {
                var th = e.target.closest('.data-table th');
                if (!th) return;
                var colName = th.textContent.trim().split(' ')[0].replace(/[↑↓]/g, '').trim();
                if (!colName) return;
                var s = self._getState(containerId);
                if (s.sortCol === colName) {
                    s.sortDir = s.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    s.sortCol = colName;
                    s.sortDir = 'asc';
                }
                self._applySort(containerId);
            });
        }
    },

    _applyFilter: function (containerId) {
        var pag = YDB.State.pagination[containerId];
        if (!pag) return;
        var s = this._getState(containerId);
        if (!pag._origData) pag._origData = pag.data.slice();

        if (!s.filterValue) {
            pag.data = pag._origData.slice();
        } else {
            var fv = s.filterValue;
            pag.data = pag._origData.filter(function (row) {
                return Object.values(row).some(function (v) {
                    return v != null && String(v).toLowerCase().indexOf(fv) >= 0;
                });
            });
        }
        pag.page = 1;
        YDB.UI._renderPage(containerId);
    },

    _applySort: function (containerId) {
        var pag = YDB.State.pagination[containerId];
        if (!pag) return;
        var s = this._getState(containerId);

        pag.data.sort(function (a, b) {
            var va = a[s.sortCol], vb = b[s.sortCol];
            if (va == null) return 1;
            if (vb == null) return -1;
            if (typeof va === 'number' && typeof vb === 'number') return s.sortDir === 'asc' ? va - vb : vb - va;
            va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
            if (va < vb) return s.sortDir === 'asc' ? -1 : 1;
            if (va > vb) return s.sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        pag.page = 1;
        YDB.UI._renderPage(containerId);

        // Update sort indicators
        var container = document.getElementById(containerId);
        container.querySelectorAll('.data-table th').forEach(function (th) {
            var name = th.textContent.trim().split(' ')[0].replace(/[↑↓]/g, '').trim();
            if (name === s.sortCol) {
                th.style.cursor = 'pointer';
                th.textContent = name + (s.sortDir === 'asc' ? ' ↑' : ' ↓');
            } else {
                th.style.cursor = 'pointer';
            }
        });
    }
};
