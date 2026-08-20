/**
 * @file adapters/sqlite.js
 * @description SQLite adapter using 'sql.js' (pure JavaScript, no native compile).
 * Database file path is passed as opts.database.
 */

const BaseAdapter = require('./base');

class SQLiteAdapter extends BaseAdapter {
    async connect() {
        const initSqlJs = require('sql.js');
        const fs = require('fs');
        const SQL = await initSqlJs();

        const dbPath = this.opts.database || ':memory:';
        if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
            const buffer = fs.readFileSync(dbPath);
            this.db = new SQL.Database(buffer);
        } else {
            this.db = new SQL.Database();
        }
        this.connected = true;
    }

    async query(sql) {
        if (!this.connected) await this.connect();
        const start = Date.now();
        try {
            const results = this.db.exec(sql);
            if (!results.length) return { columns: [], data: [], duration: Date.now() - start, rowCount: 0 };

            const result = results[0];
            const columns = result.columns;
            const data = result.values.map(row => {
                const obj = {};
                columns.forEach((col, i) => { obj[col] = row[i]; });
                return obj;
            });
            return { columns, data, duration: Date.now() - start, rowCount: data.length };
        } catch (err) {
            // Handle non-SELECT statements (INSERT, UPDATE, DELETE)
            this.db.run(sql);
            const changes = this.db.getRowsModified();
            return { columns: ['affected_rows'], data: [{ affected_rows: changes }], duration: Date.now() - start, rowCount: changes };
        }
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const result = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        const schema = { tables: {} };

        if (result.length) {
            for (const row of result[0].values) {
                const tableName = row[0];
                const pragma = this.db.exec(`PRAGMA table_info('${tableName}')`);
                if (pragma.length) {
                    schema.tables[tableName] = {
                        columns: pragma[0].values.map(col => ({
                            name: col[1],
                            type: (col[2] || 'TEXT').toUpperCase(),
                            nullable: col[3] === 0,
                            key: col[5] === 1 ? 'PK' : ''
                        }))
                    };
                }
            }
        }
        return schema;
    }

    async disconnect() {
        if (this.db) {
            // Save to file if path specified
            if (this.opts.database && this.opts.database !== ':memory:') {
                const fs = require('fs');
                const data = this.db.export();
                fs.writeFileSync(this.opts.database, Buffer.from(data));
            }
            this.db.close();
            this.db = null;
        }
        this.connected = false;
    }
}

module.exports = SQLiteAdapter;
