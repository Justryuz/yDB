/**
 * @file adapters/postgresql.js
 * @description PostgreSQL adapter using 'pg' driver.
 */

const BaseAdapter = require('./base');

class PostgreSQLAdapter extends BaseAdapter {
    async connect() {
        const { Client } = require('pg');
        this.connection = new Client({
            host: this.opts.host,
            port: this.opts.port,
            user: this.opts.user,
            password: this.opts.password,
            database: this.opts.database,
            connectionTimeoutMillis: 10000,
            statement_timeout: 60000
        });
        await this.connection.connect();
        this.connected = true;
    }

    async query(sql) {
        if (!this.connected) await this.connect();
        const start = Date.now();
        const result = await this.connection.query(sql);
        return {
            columns: result.fields.map(f => f.name),
            data: result.rows,
            duration: Date.now() - start,
            rowCount: result.rowCount
        };
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const excludeTables = ['users', 'connections', 'saved_queries', 'audit_log', 'schedules'];
        const tablesResult = await this.connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        );
        const schema = { tables: {} };
        for (const row of tablesResult.rows) {
            if (excludeTables.includes(row.table_name)) continue;
            const cols = await this.connection.query(
                `SELECT c.column_name, c.data_type, c.is_nullable,
                 CASE WHEN pk.column_name IS NOT NULL THEN 'PK'
                      WHEN fk.column_name IS NOT NULL THEN 'FK'
                      ELSE '' END as key_type
                 FROM information_schema.columns c
                 LEFT JOIN (
                     SELECT kcu.column_name FROM information_schema.table_constraints tc
                     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                     WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
                 ) pk ON pk.column_name = c.column_name
                 LEFT JOIN (
                     SELECT kcu.column_name FROM information_schema.table_constraints tc
                     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                     WHERE tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'
                 ) fk ON fk.column_name = c.column_name
                 WHERE c.table_name = $1 ORDER BY c.ordinal_position`,
                [row.table_name]
            );
            schema.tables[row.table_name] = {
                columns: cols.rows.map(c => ({
                    name: c.column_name,
                    type: c.data_type.toUpperCase(),
                    nullable: c.is_nullable === 'YES',
                    key: c.key_type || ''
                }))
            };
        }
        return schema;
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
            this.connected = false;
        }
    }
}

module.exports = PostgreSQLAdapter;
