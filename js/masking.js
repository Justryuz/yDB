/**
 * YDB - Data Masking
 * Auto-mask sensitive columns (email, password, etc.) in viewer.
 */
YDB.Masking = {
    enabled: false,
    sensitivePatterns: ['password', 'pass', 'secret', 'token', 'key', 'hash', 'ssn', 'credit_card', 'card_number'],
    emailPatterns: ['email', 'e_mail'],
    rules: [],

    init: function () {
        this._loadRules();
    },

    _loadRules: function () {
        var d = localStorage.getItem('ydb-masking-rules');
        this.rules = d ? JSON.parse(d) : this._defaultRules();
        this.enabled = localStorage.getItem('ydb-masking-enabled') === 'true';
    },

    _defaultRules: function () {
        return [
            { pattern: 'password', maskType: 'full', label: 'Password fields' },
            { pattern: 'hash', maskType: 'full', label: 'Hash fields' },
            { pattern: 'token', maskType: 'full', label: 'Tokens' },
            { pattern: 'email', maskType: 'partial', label: 'Email addresses' },
            { pattern: 'secret', maskType: 'full', label: 'Secrets' }
        ];
    },

    toggle: function () {
        this.enabled = !this.enabled;
        localStorage.setItem('ydb-masking-enabled', this.enabled.toString());
        YDB.UI.toast('Data masking ' + (this.enabled ? 'enabled' : 'disabled'), 'info');
    },

    /**
     * Check if a column name should be masked
     */
    shouldMask: function (colName) {
        if (!this.enabled) return false;
        var lower = colName.toLowerCase();
        return this.rules.some(function (rule) {
            return lower.indexOf(rule.pattern) >= 0;
        });
    },

    /**
     * Get mask type for a column
     */
    getMaskType: function (colName) {
        var lower = colName.toLowerCase();
        var rule = this.rules.find(function (r) { return lower.indexOf(r.pattern) >= 0; });
        return rule ? rule.maskType : 'full';
    },

    /**
     * Apply mask to a value based on column name
     */
    mask: function (value, colName) {
        if (!this.enabled || value == null) return value;
        if (!this.shouldMask(colName)) return value;

        var type = this.getMaskType(colName);
        var str = String(value);

        if (type === 'full') {
            return '••••••••';
        } else if (type === 'partial') {
            // For emails: show first 2 chars + mask + @domain
            if (str.indexOf('@') >= 0) {
                var parts = str.split('@');
                return parts[0].substring(0, 2) + '•••@' + parts[1];
            }
            // Generic partial: show first and last char
            if (str.length > 4) return str[0] + '•••' + str[str.length - 1];
            return '••••';
        }
        return '••••••••';
    },

    /**
     * Apply masking to result data
     */
    applyToData: function (columns, data) {
        if (!this.enabled) return data;
        var self = this;
        return data.map(function (row) {
            var newRow = {};
            columns.forEach(function (col) {
                newRow[col] = self.mask(row[col], col);
            });
            return newRow;
        });
    }
};
