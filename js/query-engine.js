/**
 * YDB - Mock SQL Query Engine
 * Parses simple SQL and returns data from mock schemas.
 */
YDB.QueryEngine = {
    execute: function (sql) {
        var flat = sql.toLowerCase().replace(/;$/, '').replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

        // Find all table references
        var tables = [];
        var fromMatch = flat.match(/from\s+([\w.]+)/);
        if (!fromMatch) return { error: 'Cannot parse query. Try: SELECT * FROM table_name' };
        tables.push(this._resolve(fromMatch[1]));

        var joinRe = /join\s+([\w.]+)/g, jm;
        while ((jm = joinRe.exec(flat)) !== null) tables.push(this._resolve(jm[1]));
        tables = tables.filter(Boolean);
        if (!tables.length) return { error: 'Table not found.' };

        // Parse SELECT columns
        var selMatch = flat.match(/select\s+(.+?)\s+from/);
        var cols = [];
        if (selMatch) {
            var sp = selMatch[1].trim();
            if (sp === '*') {
                tables.forEach(function (t) { t.table.columns.forEach(function (c) { cols.push({ display: tables.length > 1 ? t.name + '.' + c.name : c.name, table: t.name, col: c.name }); }); });
            } else {
                sp.split(',').forEach(function (c) {
                    c = c.trim(); var parts = c.split('.'); var cn = parts[parts.length - 1].trim();
                    var tn = parts.length >= 2 ? parts[parts.length - 2].trim() : null;
                    var found = tn ? tables.find(function (t) { return t.name === tn; }) : tables.find(function (t) { return t.table.columns.some(function (tc) { return tc.name === cn; }); });
                    cols.push({ display: tables.length > 1 && found ? found.name + '.' + cn : cn, table: found ? found.name : '', col: cn });
                });
            }
        } else {
            tables[0].table.columns.forEach(function (c) { cols.push({ display: c.name, table: tables[0].name, col: c.name }); });
        }

        // Build result data
        var data = [];
        if (tables.length === 1) {
            tables[0].table.data.forEach(function (row) {
                var nr = {}; cols.forEach(function (c) { if (row.hasOwnProperty(c.col)) nr[c.display] = row[c.col]; }); data.push(nr);
            });
        } else {
            // Parse ON conditions
            var conditions = [], onRe = /on\s+([\w.]+)\s*=\s*([\w.]+)/g, om;
            while ((om = onRe.exec(flat)) !== null) {
                var lp = om[1].split('.'), rp = om[2].split('.');
                conditions.push({ lt: lp[lp.length-2], lc: lp[lp.length-1], rt: rp[rp.length-2], rc: rp[rp.length-1] });
            }
            // Nested loop join simulation
            tables[0].table.data.forEach(function (pRow) {
                var merged = {};
                cols.forEach(function (c) { if (c.table === tables[0].name && pRow.hasOwnProperty(c.col)) merged[c.display] = pRow[c.col]; });
                for (var i = 1; i < tables.length; i++) {
                    var jt = tables[i], matched = null;
                    var cond = conditions.find(function (cd) { return cd.lt === jt.name || cd.rt === jt.name; });
                    if (cond) {
                        var pk = cond.lt === jt.name ? cond.rc : cond.lc;
                        var jk = cond.lt === jt.name ? cond.lc : cond.rc;
                        var pv = pRow[pk]; if (pv === undefined) { for (var k in merged) { if (merged.hasOwnProperty(k) && k.endsWith('.' + pk)) { pv = merged[k]; break; } } }
                        matched = jt.table.data.find(function (r) { return r[jk] == pv; });
                    }
                    cols.forEach(function (c) {
                        if (c.table === jt.name) merged[c.display] = matched && matched.hasOwnProperty(c.col) ? matched[c.col] : null;
                    });
                }
                data.push(merged);
            });
        }

        // LIMIT
        var lm = flat.match(/limit\s+(\d+)/);
        if (lm) data = data.slice(0, parseInt(lm[1]));

        return { columns: cols.map(function (c) { return c.display; }), data: data };
    },

    _resolve: function (ref) {
        var name, schema;
        if (ref.indexOf('.') >= 0) {
            var p = ref.split('.'); var db = p[0]; name = p[1];
            var ids = Object.keys(YDB.MockData.schemas);
            for (var i = 0; i < ids.length; i++) { if (YDB.MockData.schemas[ids[i]].name === db) { schema = YDB.MockData.schemas[ids[i]]; break; } }
        }
        if (!schema) {
            name = ref;
            if (YDB.State.activeConnection) { var s = YDB.MockData.schemas[YDB.State.activeConnection.id]; if (s && s.tables[name]) schema = s; }
            if (!schema) { var all = Object.keys(YDB.MockData.schemas); for (var j = 0; j < all.length; j++) { if (YDB.MockData.schemas[all[j]].tables[name]) { schema = YDB.MockData.schemas[all[j]]; break; } } }
        }
        if (!schema || !schema.tables[name]) return null;
        return { name: name, table: schema.tables[name], dbName: schema.name };
    }
};
