/**
 * @file adapters/neo4j.js
 * @description Neo4j graph database adapter using 'neo4j-driver'.
 */

const BaseAdapter = require('./base');

class Neo4jAdapter extends BaseAdapter {
    async connect() {
        const neo4j = require('neo4j-driver');
        const uri = `bolt://${this.opts.host}:${this.opts.port || 7687}`;
        this.driver = neo4j.driver(uri, neo4j.auth.basic(this.opts.user || 'neo4j', this.opts.password || ''));
        this.session = this.driver.session({ database: this.opts.database || 'neo4j' });
        await this.driver.verifyConnectivity();
        this.connected = true;
    }

    async query(cypher) {
        if (!this.connected) await this.connect();
        const start = Date.now();
        const result = await this.session.run(cypher);
        const records = result.records;

        if (!records.length) return { columns: [], data: [], duration: Date.now() - start, rowCount: 0 };

        const columns = records[0].keys;
        const data = records.map(record => {
            const row = {};
            columns.forEach(key => {
                const val = record.get(key);
                row[key] = val && val.properties ? val.properties : (val && val.toNumber ? val.toNumber() : val);
            });
            return row;
        });

        return { columns, data, duration: Date.now() - start, rowCount: data.length };
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const labelsResult = await this.session.run('CALL db.labels()');
        const schema = { tables: {} };

        for (const record of labelsResult.records) {
            const label = record.get('label');
            const propsResult = await this.session.run(
                `MATCH (n:\`${label}\`) WITH n LIMIT 1 RETURN keys(n) as props`
            );
            const props = propsResult.records.length ? propsResult.records[0].get('props') : [];
            schema.tables[label] = {
                columns: props.map(p => ({ name: p, type: 'ANY', nullable: true, key: '' }))
            };
        }
        return schema;
    }

    async disconnect() {
        if (this.session) await this.session.close();
        if (this.driver) await this.driver.close();
        this.session = null;
        this.driver = null;
        this.connected = false;
    }
}

module.exports = Neo4jAdapter;
