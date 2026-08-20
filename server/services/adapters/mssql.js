/**
 * @file adapters/mssql.js
 * @description Microsoft SQL Server adapter using 'mssql' driver.
 */

const BaseAdapter = require('./base');

class MSSQLAdapter extends BaseAdapter {
    async connect() {
        const sql = require('mssql');
        this.pool = await sql.connect({
            server: this.opts.host,
            port: this.opts.port,
            database: this.opts.database,
            user: this.opts.user,
            password: this.opts.password,
            options: { encrypt: false, trustServerCertificate: true },
            connectionTimeout: 10000,
            requestTimeout: 60000
        });
        this.connected = true;
    }

    async query(sqlText) {
        if (!this.connected) await this.connect();
        const start = Date.now();
        const result = await this.pool.request().query(sqlText);
        const columns = result.recordset.length ? Object.keys(result.recordset[0]) : [];
        return { columns, data: result.recordset, duration: Date.now() - start, rowCount: result.recordset.length };
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const tables = await this.pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'");
        const schema = { tables: {} };
        for (const row of tables.recordset) {
            const cols = await this.pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${row.TABLE_NAME}'`);
            schema.tables[row.TABLE_NAME] = {
                columns: cols.recordset.map(c => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE.toUpperCase(), nullable: c.IS_NULLABLE === 'YES', key: '' }))
            };
        }
        return schema;
    }

    async disconnect() {
        if (this.pool) { await this.pool.close(); this.pool = null; this.connected = false; }
    }
}

module.exports = MSSQLAdapter;
