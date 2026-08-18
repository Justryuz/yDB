/**
 * YDB - SQL Autocomplete
 * Suggests table names, column names, and SQL keywords while typing.
 */
YDB.Autocomplete = {
    keywords: ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'DISTINCT', 'AS', 'ASC', 'DESC', 'UNION', 'EXISTS'],
    dropdownEl: null,
    visible: false,
    suggestions: [],
    selectedIdx: 0,

    init: function () {
        var self = this;
        this._createDropdown();
        var input = document.getElementById('sql-input');
        var debounceTimer = null;
        input.addEventListener('input', function () {
            var el = this;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () { self._onInput(el); }, 100);
        });
        input.addEventListener('keydown', function (e) { self._onKeydown(e); });
        input.addEventListener('blur', function () { setTimeout(function () { self.hide(); }, 200); });
    },

    _createDropdown: function () {
        var self = this;
        var el = document.createElement('div');
        el.id = 'autocomplete-dropdown';
        el.className = 'absolute z-50 bg-base-100 border border-base-300 rounded-lg shadow-xl max-h-48 overflow-y-auto hidden';
        el.style.minWidth = '200px';
        // Event delegation — one listener for all items
        el.addEventListener('mousedown', function (e) {
            var item = e.target.closest('[data-idx]');
            if (item) { e.preventDefault(); self._accept(parseInt(item.dataset.idx)); }
        });
        document.body.appendChild(el);
        this.dropdownEl = el;
    },

    _onInput: function (textarea) {
        var pos = textarea.selectionStart;
        var text = textarea.value.substring(0, pos);
        var word = text.match(/[\w.]*$/)[0];

        if (word.length < 2) { this.hide(); return; }

        this.suggestions = this._getSuggestions(word.toLowerCase());
        if (!this.suggestions.length) { this.hide(); return; }

        this.selectedIdx = 0;
        this._renderDropdown(textarea);
    },

    _getSuggestions: function (prefix) {
        var results = [];
        // Keywords
        this.keywords.forEach(function (kw) {
            if (kw.toLowerCase().indexOf(prefix) === 0) results.push({ label: kw, type: 'keyword' });
        });
        // Table names
        var conn = YDB.State.activeConnection;
        if (conn) {
            var schema = YDB.MockData.schemas[conn.id];
            if (schema) {
                Object.keys(schema.tables).forEach(function (tn) {
                    if (tn.toLowerCase().indexOf(prefix) === 0) results.push({ label: tn, type: 'table' });
                    // Column names
                    schema.tables[tn].columns.forEach(function (col) {
                        if (col.name.toLowerCase().indexOf(prefix) === 0) results.push({ label: col.name, type: 'column', detail: tn });
                    });
                });
            }
        }
        return results.slice(0, 12);
    },

    _renderDropdown: function (textarea) {
        var self = this;
        var rect = textarea.getBoundingClientRect();
        var el = this.dropdownEl;
        el.style.left = (rect.left + 60) + 'px';
        el.style.top = (rect.top + 40) + 'px';

        el.innerHTML = this.suggestions.map(function (s, i) {
            var icon = s.type === 'keyword' ? '&#128292;' : s.type === 'table' ? '&#128203;' : '&#128202;';
            var cls = i === self.selectedIdx ? 'bg-primary/20' : '';
            var detail = s.detail ? '<span class="text-xs text-base-content/40 ml-auto">' + s.detail + '</span>' : '';
            return '<div class="px-3 py-1.5 cursor-pointer hover:bg-base-200 flex items-center gap-2 text-xs ' + cls + '" data-idx="' + i + '">'
                + '<span>' + icon + '</span><span class="font-mono">' + s.label + '</span>' + detail + '</div>';
        }).join('');
        el.classList.remove('hidden');
        this.visible = true;
    },

    _onKeydown: function (e) {
        if (!this.visible) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); this.selectedIdx = Math.min(this.selectedIdx + 1, this.suggestions.length - 1); this._renderDropdown(e.target); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.selectedIdx = Math.max(this.selectedIdx - 1, 0); this._renderDropdown(e.target); }
        else if (e.key === 'Tab' || e.key === 'Enter') {
            if (this.visible && this.suggestions.length) { e.preventDefault(); this._accept(this.selectedIdx); }
        }
        else if (e.key === 'Escape') { this.hide(); }
    },

    _accept: function (idx) {
        var suggestion = this.suggestions[idx];
        if (!suggestion) return;
        var textarea = document.getElementById('sql-input');
        var pos = textarea.selectionStart;
        var text = textarea.value;
        var before = text.substring(0, pos);
        var word = before.match(/[\w.]*$/)[0];
        var newText = text.substring(0, pos - word.length) + suggestion.label + text.substring(pos);
        textarea.value = newText;
        var newPos = pos - word.length + suggestion.label.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
        this.hide();
    },

    hide: function () {
        this.dropdownEl.classList.add('hidden');
        this.visible = false;
    }
};
