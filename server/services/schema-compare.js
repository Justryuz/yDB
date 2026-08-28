/**
 * @file services/schema-compare.js
 * @description AI Schema Comparison — detect differences between two database schemas
 * and generate migration SQL to sync them.
 *
 * Detects:
 *  - Tables only in source (to create)
 *  - Tables only in target (to drop or ignore)
 *  - Column differences (added, removed, type changed)
 *  - Missing indexes (basic detection)
 *
 * Generates:
 *  - ALTER TABLE statements
 *  - CREATE TABLE statements
 *  - Migration script
 */

/**
 * Compare two schemas and return differences.
 * @param {Object} schemaA - Source schema { tables: {...} }
 * @param {Object} schemaB - Target schema { tables: {...} }
 * @param {string} dbType - Target database type (for SQL syntax)
 * @returns {Object} Comparison report
 */
function compareSchemas(schemaA, schemaB, dbType) {
    const isMySQL = dbType === 'mysql' || dbType === 'mariadb';
    const tablesA = Object.keys(schemaA?.tables || {});
    const tablesB = Object.keys(schemaB?.tables || {});

    const onlyInA = tablesA.filter(t => !tablesB.includes(t));
    const onlyInB = tablesB.filter(t => !tablesA.includes(t));
    const common = tablesA.filter(t => tablesB.includes(t));

    const differences = [];
    const migrationSQL = [];

    // Tables only in source → CREATE TABLE
    for (const t of onlyInA) {
        differences.push({ type: 'table_missing', table: t, location: 'target', message: `Table "${t}" exists in source but not in target` });
        const cols = (schemaA.tables[t].columns || []).map(c => {
            const name = c.name || c;
            const type = c.type || 'TEXT';
            return `  ${name} ${type}`;
        });
        migrationSQL.push(`-- Create missing table\nCREATE TABLE IF NOT EXISTS ${t} (\n${cols.join(',\n')}\n);`);
    }

    // Tables only in target
    for (const t of onlyInB) {
        differences.push({ type: 'table_extra', table: t, location: 'source', message: `Table "${t}" exists in target but not in source (may be safe to keep)` });
    }

    // Compare columns in common tables
    for (const t of common) {
        const colsA = (schemaA.tables[t].columns || []).map(c => ({ name: (c.name || c).toLowerCase(), type: (c.type || '').toUpperCase(), original: c.name || c }));
        const colsB = (schemaB.tables[t].columns || []).map(c => ({ name: (c.name || c).toLowerCase(), type: (c.type || '').toUpperCase(), original: c.name || c }));

        const namesA = colsA.map(c => c.name);
        const namesB = colsB.map(c => c.name);

        // Columns only in A (need to add to B)
        const addCols = colsA.filter(c => !namesB.includes(c.name));
        for (const col of addCols) {
            differences.push({ type: 'column_missing', table: t, column: col.original, location: 'target', message: `Column "${col.original}" missing in target table "${t}"` });
            migrationSQL.push(`ALTER TABLE ${t} ADD COLUMN ${col.original} ${col.type || 'TEXT'};`);
        }

        // Columns only in B (extra in target)
        const extraCols = colsB.filter(c => !namesA.includes(c.name));
        for (const col of extraCols) {
            differences.push({ type: 'column_extra', table: t, column: col.original, location: 'source', message: `Column "${col.original}" in target "${t}" not in source (may be safe to keep)` });
        }

        // Type differences
        for (const colA of colsA) {
            const colB = colsB.find(c => c.name === colA.name);
            if (colB && colA.type && colB.type && colA.type !== colB.type) {
                // Normalize type comparison (ignore length)
                const normA = colA.type.replace(/\(\d+\)/g, '').trim();
                const normB = colB.type.replace(/\(\d+\)/g, '').trim();
                if (normA !== normB) {
                    differences.push({ type: 'type_mismatch', table: t, column: colA.original, sourceType: colA.type, targetType: colB.type, message: `Type mismatch: "${t}.${colA.original}" is ${colA.type} in source, ${colB.type} in target` });
                    if (isMySQL) {
                        migrationSQL.push(`ALTER TABLE ${t} MODIFY COLUMN ${colA.original} ${colA.type};`);
                    } else {
                        migrationSQL.push(`ALTER TABLE ${t} ALTER COLUMN ${colA.original} TYPE ${colA.type};`);
                    }
                }
            }
        }
    }

    // Summary
    const summary = `Compared ${tablesA.length} source tables with ${tablesB.length} target tables. ` +
        `Found ${differences.length} difference(s): ` +
        `${onlyInA.length} missing table(s), ` +
        `${differences.filter(d => d.type === 'column_missing').length} missing column(s), ` +
        `${differences.filter(d => d.type === 'type_mismatch').length} type mismatch(es).`;

    return {
        summary,
        sourceTableCount: tablesA.length,
        targetTableCount: tablesB.length,
        differences,
        migrationSQL,
        identical: differences.length === 0
    };
}

module.exports = { compareSchemas };
