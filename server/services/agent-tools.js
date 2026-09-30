/**
 * @file services/agent-tools.js
 * @description Safe, read-only "tools" the ReAct agent can call during its loop.
 *
 * Every tool is scoped to a single user's connection and enforces the same
 * read-only guardrail as the Copilot (validateSQL). Tools are deliberately small
 * and return compact, model-friendly summaries.
 *
 * Tool set:
 *   list_tables      — table names in the schema
 *   describe_table   — columns (name/type/key) for one table
 *   sample_rows      — a few rows from a table (masked, capped)
 *   explain_query    — EXPLAIN output for a SELECT
 *   run_query        — execute a SELECT (read-only), capped row count
 */

const { validateSQL } = require('./nlq');
const { applyMasking } = require('../middleware/masking');

const MAX_SAMPLE_ROWS = 5;
const MAX_RESULT_ROWS = 200;

/** Quote an identifier for the dialect. */
function quoteIdent(name, dbType) {
    const isMySQL = dbType === 'mysql' || dbType === 'mariadb';
    return isMySQL ? '`' + String(name).replace(/`/g, '``') + '`'
                   : '"' + String(name).replace(/"/g, '""') + '"';
}

/**
 * Build the tool set bound to a live adapter + schema + user role.
 * @param {object} ctx { adapter, schema, dbType, role }
 * @returns {{ specs: Array, dispatch: Function }}
 */
function createTools(ctx) {
    const { adapter, schema, dbType, role } = ctx;
    const tables = Object.keys((schema && schema.tables) || {});

    // Descriptions the model sees so it knows what it can do.
    const specs = [
        { name: 'list_tables', description: 'List all table names available in the database.', args: {} },
        { name: 'describe_table', description: 'Get columns (name, type, key) for one table.', args: { table: 'string' } },
        { name: 'sample_rows', description: `Return up to ${MAX_SAMPLE_ROWS} sample rows from a table to understand its data.`, args: { table: 'string' } },
        { name: 'explain_query', description: 'Run EXPLAIN on a SELECT query to inspect its plan.', args: { sql: 'string' } },
        { name: 'run_query', description: `Execute a read-only SELECT and return rows (max ${MAX_RESULT_ROWS}).`, args: { sql: 'string' } },
        { name: 'final_answer', description: 'Provide the final SQL + explanation once confident.', args: { sql: 'string', explanation: 'string', chartType: 'string' } }
    ];

    async function dispatch(tool, args) {
        args = args || {};
        switch (tool) {
            case 'list_tables':
                return { tables };

            case 'describe_table': {
                const t = args.table;
                if (!tables.includes(t)) return { error: `Unknown table "${t}". Available: ${tables.join(', ')}` };
                const cols = (schema.tables[t].columns || []).map(c => ({
                    name: c.name || c, type: c.type || 'TEXT', key: c.key || ''
                }));
                return { table: t, columns: cols };
            }

            case 'sample_rows': {
                const t = args.table;
                if (!tables.includes(t)) return { error: `Unknown table "${t}".` };
                const sql = `SELECT * FROM ${quoteIdent(t, dbType)} LIMIT ${MAX_SAMPLE_ROWS}`;
                try {
                    const r = await adapter.query(sql);
                    const masked = applyMasking(r, role);
                    return { table: t, columns: masked.columns, rows: masked.data };
                } catch (e) {
                    return { error: e.message };
                }
            }

            case 'explain_query': {
                const check = validateSQL(args.sql);
                if (!check.valid) return { error: check.reason };
                const prefix = (dbType === 'postgresql' || dbType === 'postgres') ? 'EXPLAIN ' : 'EXPLAIN ';
                try {
                    const r = await adapter.query(prefix + args.sql);
                    return { plan: r.data };
                } catch (e) {
                    return { error: e.message };
                }
            }

            case 'run_query': {
                const check = validateSQL(args.sql);
                if (!check.valid) return { error: check.reason };
                try {
                    const r = await adapter.query(args.sql);
                    const masked = applyMasking(r, role);
                    const rows = (masked.data || []).slice(0, MAX_RESULT_ROWS);
                    return {
                        columns: masked.columns,
                        rows,
                        rowCount: masked.data ? masked.data.length : 0,
                        truncated: (masked.data || []).length > MAX_RESULT_ROWS
                    };
                } catch (e) {
                    return { error: e.message };
                }
            }

            default:
                return { error: `Unknown tool "${tool}"` };
        }
    }

    return { specs, dispatch };
}

module.exports = { createTools, MAX_SAMPLE_ROWS, MAX_RESULT_ROWS };
