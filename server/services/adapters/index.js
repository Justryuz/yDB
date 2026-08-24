/**
 * @file adapters/index.js
 * @description Adapter factory — returns the correct adapter for a given DB type.
 */

const PostgreSQLAdapter = require('./postgresql');
const MySQLAdapter = require('./mysql');
const MongoDBAdapter = require('./mongodb');
const MSSQLAdapter = require('./mssql');
const RedisAdapter = require('./redis');
const Neo4jAdapter = require('./neo4j');
const SQLiteAdapter = require('./sqlite');
const DynamoDBAdapter = require('./dynamodb');
const ClickHouseAdapter = require('./clickhouse');
const RestAPIAdapter = require('./rest-api');

const adapterMap = {
    postgresql: PostgreSQLAdapter,
    mysql: MySQLAdapter,
    mariadb: MySQLAdapter,
    mongodb: MongoDBAdapter,
    mssql: MSSQLAdapter,
    azuresql: MSSQLAdapter,
    synapse: MSSQLAdapter,
    redis: RedisAdapter,
    neo4j: Neo4jAdapter,
    sqlite: SQLiteAdapter,
    dynamodb: DynamoDBAdapter,
    redshift: PostgreSQLAdapter,
    clickhouse: ClickHouseAdapter,
    restapi: RestAPIAdapter,
    api: RestAPIAdapter
};

/**
 * Create an adapter instance for a given DB type and connection options.
 * @param {string} dbType - Database type
 * @param {Object} opts - { host, port, user, password, database }
 * @returns {BaseAdapter}
 */
function createAdapter(dbType, opts) {
    const AdapterClass = adapterMap[dbType];
    if (!AdapterClass) {
        throw new Error(`Unsupported database type: ${dbType}. Supported: ${Object.keys(adapterMap).join(', ')}`);
    }
    return new AdapterClass(opts);
}

/**
 * Get list of supported database types.
 * @returns {string[]}
 */
function getSupportedTypes() {
    return Object.keys(adapterMap);
}

module.exports = { createAdapter, getSupportedTypes };
