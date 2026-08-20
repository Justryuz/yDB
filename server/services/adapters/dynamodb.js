/**
 * @file adapters/dynamodb.js
 * @description AWS DynamoDB adapter using '@aws-sdk/client-dynamodb'.
 * opts.host = AWS region (e.g. 'us-east-1')
 * opts.user = AWS Access Key ID
 * opts.password = AWS Secret Access Key
 */

const BaseAdapter = require('./base');

class DynamoDBAdapter extends BaseAdapter {
    async connect() {
        const { DynamoDBClient, ListTablesCommand, ScanCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
        const { unmarshall } = require('@aws-sdk/util-dynamodb');

        this.client = new DynamoDBClient({
            region: this.opts.host || 'us-east-1',
            credentials: {
                accessKeyId: this.opts.user,
                secretAccessKey: this.opts.password
            }
        });
        this.unmarshall = unmarshall;
        this.commands = { ListTablesCommand, ScanCommand, DescribeTableCommand };
        this.connected = true;
    }

    async query(sql) {
        if (!this.connected) await this.connect();
        const start = Date.now();
        // Parse table name from simple query
        const match = sql.match(/from\s+(\w+)/i);
        const tableName = match ? match[1] : sql.trim();

        const result = await this.client.send(new this.commands.ScanCommand({ TableName: tableName, Limit: 500 }));
        const items = (result.Items || []).map(item => this.unmarshall(item));
        const columns = items.length ? Object.keys(items[0]) : [];

        return { columns, data: items, duration: Date.now() - start, rowCount: items.length };
    }

    async getSchema() {
        if (!this.connected) await this.connect();
        const tablesResult = await this.client.send(new this.commands.ListTablesCommand({}));
        const schema = { tables: {} };

        for (const tableName of (tablesResult.TableNames || [])) {
            const desc = await this.client.send(new this.commands.DescribeTableCommand({ TableName: tableName }));
            const keySchema = desc.Table.KeySchema || [];
            const attrs = desc.Table.AttributeDefinitions || [];

            schema.tables[tableName] = {
                columns: attrs.map(a => ({
                    name: a.AttributeName,
                    type: a.AttributeType === 'N' ? 'NUMBER' : a.AttributeType === 'B' ? 'BINARY' : 'STRING',
                    nullable: false,
                    key: keySchema.find(k => k.AttributeName === a.AttributeName) ? 'PK' : ''
                }))
            };
        }
        return schema;
    }

    async disconnect() {
        this.client = null;
        this.connected = false;
    }
}

module.exports = DynamoDBAdapter;
