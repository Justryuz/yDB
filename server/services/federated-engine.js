/**
 * @file services/federated-engine.js
 * @description DuckDB-powered federated query engine.
 * Fetches data from multiple database connections, loads into DuckDB temporary tables,
 * executes the full SQL JOIN inside DuckDB, returns merged results.
 *
 * Supports 10+ concurrent database sources in a single query.
 */

const { Database } = require('duckdb-async');

class FederatedEngine {
    constructor() {
        this.db = null;
    }

    /**
     * Initialize DuckDB in-memory instance.
     */
    async init() {
        this.db = await Database.create(':memory:');
        return this;
    }

    /**
     * Execute a federated query across multiple sources.
     *
     * @param {Array} sources - [{ name: 'tableName', columns: [...], data: [...] }, ...]
     * @param {string} sql - SQL query referencing the source table names
     * @returns {{ columns: string[], data: Object[], duration: number, rowCount: number }}
     */
    async execute(sources, sql) {
        const db = await Database.create(':memory:');
        const start = Date.now();

        try {
            // Load each source as a temporary table in DuckDB
            for (const source of sources) {
                if (!source.data || !source.data.length) continue;

                const columns = source.columns || Object.keys(source.data[0]);
                const tableName = source.name.replace(/[^a-zA-Z0-9_]/g, '_');

                // Create table with inferred types
                const colDefs = columns.map(col => {
                    const sample = source.data[0][col];
                    let type = 'VARCHAR';
                    if (typeof sample === 'number') type = Number.isInteger(sample) ? 'BIGINT' : 'DOUBLE';
                    else if (typeof sample === 'boolean') type = 'BOOLEAN';
                    else if (sample instanceof Date) type = 'TIMESTAMP';
                    return `"${col}" ${type}`;
                });

                await db.run(`CREATE TABLE "${tableName}" (${colDefs.join(', ')})`);

                // Insert data in batches
                const batchSize = 500;
                for (let i = 0; i < source.data.length; i += batchSize) {
                    const batch = source.data.slice(i, i + batchSize);
                    const placeholders = batch.map(() => '(' + columns.map(() => '?').join(',') + ')').join(',');
                    const values = [];
                    batch.forEach(row => {
                        columns.forEach(col => {
                            const v = row[col];
                            values.push(v === undefined ? null : v);
                        });
                    });

                    const insertSql = `INSERT INTO "${tableName}" VALUES ${placeholders}`;
                    await db.run(insertSql, ...values);
                }
            }

            // Execute the federated SQL
            const rawResult = await db.all(sql);

            // Convert BigInt to Number (DuckDB returns BigInt for integers)
            const result = rawResult.map(row => {
                const newRow = {};
                Object.entries(row).forEach(([key, val]) => {
                    newRow[key] = typeof val === 'bigint' ? Number(val) : val;
                });
                return newRow;
            });

            const columns = result.length ? Object.keys(result[0]) : [];
            const duration = Date.now() - start;

            return { columns, data: result, duration, rowCount: result.length };
        } finally {
            await db.close();
        }
    }

    /**
     * Simple federated join between exactly 2 sources (backward compat with existing federated route).
     *
     * @param {Object} leftSource - { name, columns, data }
     * @param {Object} rightSource - { name, columns, data }
     * @param {Object} joinConfig - { leftCol, rightCol, type: 'INNER'|'LEFT'|'RIGHT'|'FULL' }
     * @param {string[]} selectColumns - Columns to select (empty = all)
     * @returns {{ columns, data, duration, rowCount }}
     */
    async join(leftSource, rightSource, joinConfig, selectColumns) {
        const leftName = leftSource.name.replace(/[^a-zA-Z0-9_]/g, '_');
        const rightName = rightSource.name.replace(/[^a-zA-Z0-9_]/g, '_');

        // Build SELECT
        let select = '*';
        if (selectColumns && selectColumns.length) {
            select = selectColumns.map(c => {
                if (c.indexOf('.') >= 0) return `"${c.split('.')[0]}"."${c.split('.')[1]}"`;
                return `"${c}"`;
            }).join(', ');
        } else {
            // Prefix columns with table name to avoid ambiguity
            const leftCols = (leftSource.columns || Object.keys(leftSource.data[0] || {})).map(c => `"${leftName}"."${c}" AS "${leftName}.${c}"`);
            const rightCols = (rightSource.columns || Object.keys(rightSource.data[0] || {})).map(c => `"${rightName}"."${c}" AS "${rightName}.${c}"`);
            select = [...leftCols, ...rightCols].join(', ');
        }

        const joinType = (joinConfig.type || 'INNER').toUpperCase();
        const sql = `SELECT ${select} FROM "${leftName}" ${joinType} JOIN "${rightName}" ON "${leftName}"."${joinConfig.leftCol}" = "${rightName}"."${joinConfig.rightCol}"`;

        return this.execute([leftSource, rightSource], sql);
    }
}

module.exports = FederatedEngine;
