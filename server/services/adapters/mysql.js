/**
 * @file adapters/mysql.js
 * @description MySQL/MariaDB adapter using 'mysql2' driver.
 */

const BaseAdapter = require('./base');

class MySQLAdapter extends BaseAdapter {
    async connect() {
        const mysql = require('mysql2/promise');
        const connOpts = {
            host: this.opts.host,
            port: this.opts.port,
            user: this.opts.user,
            password: this.opts.password,
            database: this.opts.database,
            connectTimeout: 15000,
            // Enable SSL for cloud-hosted MySQL (Alibaba, Aiven, AWS RDS, etc.)
            ssl: this.opts.ssl === false ? undefined : { rejectUnauthorized: false }
        };
        this.connection = await mysql.createConnection(connOpts);
        this.connected = true;
    }

    async query(sql) {
        if (!this.connected) await this.connect();
        const start = Date.now();
        const [rows, fields] = await this.connection.query(sql);
        return {
            columns: fields ? fields.map(f => f.name) : Object.keys(rows[0] || {}),
            data: Array.isArray(rows) ? rows : [],
            duration: Date.now() - start,
            rowCount: Array.isArray(rows) ? rows.length : 0
        };
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const [tables] = await this.connection.query('SHOW TABLES');
        const key = Object.keys(tables[0] || {})[0];
        const schema = { tables: {} };
        for (const row of tables) {
            const tn = row[key];
            const [cols] = await this.connection.query('DESCRIBE ??', [tn]);
            schema.tables[tn] = {
                columns: cols.map(c => ({
                    name: c.Field,
                    type: c.Type.toUpperCase(),
                    nullable: c.Null === 'YES',
                    key: c.Key === 'PRI' ? 'PK' : c.Key === 'MUL' ? 'FK' : ''
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

    /**
     * Cancel a running query using KILL QUERY.
     */
    async cancel() {
        if (this.connection) {
            try {
                const [rows] = await this.connection.query('SELECT CONNECTION_ID() as id');
                const threadId = rows[0]?.id;
                if (threadId) {
                    // Need a separate connection to issue KILL
                    const mysql = require('mysql2/promise');
                    const killConn = await mysql.createConnection({
                        host: this.opts.host,
                        port: this.opts.port,
                        user: this.opts.user,
                        password: this.opts.password,
                        database: this.opts.database,
                        connectTimeout: 5000
                    });
                    await killConn.query(`KILL QUERY ${threadId}`);
                    await killConn.end();
                }
            } catch (err) {
                console.warn('[MySQL] Cancel failed:', err.message);
                if (this.connection && typeof this.connection.destroy === 'function') {
                    this.connection.destroy();
                }
            }
        }
    }

}

module.exports = MySQLAdapter;
