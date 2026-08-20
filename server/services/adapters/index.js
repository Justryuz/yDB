/**
 * @file adapters/index.js
 * @description Adapter factory — returns the correct adapter for a given DB type.
 */

const PostgreSQLAdapter = require('./postgresql');
const MySQLAdapter = require('./mysql');
const MongoDBAdapter = require('./mongodb');
const MSSQLAdapter = require('./mssql');
const RedisAdapter = require('./redis');

const adapterMap = {
    postgresql: PostgreSQLAdapter,
    mysql: MySQLAdapter,
    mariadb: MySQLAdapter,
    mongodb: MongoDBAdapter,
    mssql: MSSQLAdapter,
    redis: RedisAdapter
};

/**
 * Create an adapter instance for a given DB type and connection options.
 * @param {string} dbType - Database type (postgresql, mysql, mongodb, etc.)
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
