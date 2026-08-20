/**
 * @file adapters/mongodb.js
 * @description MongoDB adapter using 'mongodb' driver.
 */

const BaseAdapter = require('./base');

class MongoDBAdapter extends BaseAdapter {
    async connect() {
        const { MongoClient } = require('mongodb');
        const url = this.opts.user
            ? `mongodb://${this.opts.user}:${this.opts.password}@${this.opts.host}:${this.opts.port}/${this.opts.database}`
            : `mongodb://${this.opts.host}:${this.opts.port}/${this.opts.database}`;
        this.client = new MongoClient(url, { serverSelectionTimeoutMS: 10000 });
        await this.client.connect();
        this.db = this.client.db(this.opts.database);
        this.connected = true;
    }

    async query(sql) {
        if (!this.connected) await this.connect();
        // Parse simple FROM clause to get collection name
        const match = sql.match(/from\s+(\w+)/i);
        const collection = match ? match[1] : sql.trim();
        const start = Date.now();
        const docs = await this.db.collection(collection).find({}).limit(500).toArray();
        const columns = docs.length ? Object.keys(docs[0]) : [];
        return { columns, data: docs, duration: Date.now() - start, rowCount: docs.length };
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const collections = await this.db.listCollections().toArray();
        const schema = { tables: {} };
        for (const col of collections) {
            const sample = await this.db.collection(col.name).findOne();
            schema.tables[col.name] = {
                columns: sample ? Object.keys(sample).map(k => ({
                    name: k,
                    type: Array.isArray(sample[k]) ? 'ARRAY' : typeof sample[k] === 'number' ? 'NUMBER' : typeof sample[k] === 'object' ? 'OBJECT' : 'STRING',
                    nullable: true,
                    key: k === '_id' ? 'PK' : ''
                })) : []
            };
        }
        return schema;
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            this.connected = false;
        }
    }
}

module.exports = MongoDBAdapter;
