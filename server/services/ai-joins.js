/**
 * @file services/ai-joins.js
 * @description AI-powered JOIN relationship detection.
 * Analyzes column names, types, and patterns across tables/databases
 * to suggest JOIN conditions — even without explicit FK constraints.
 *
 * Features:
 *  - Smart column matching (naming pattern analysis)
 *  - Cross-database relationship inference
 *  - Natural language join parsing
 *  - Confidence scoring per suggestion
 */

/**
 * Detect potential JOIN relationships between two tables.
 * @param {Object} tableA - { name, columns: [{name, type}] }
 * @param {Object} tableB - { name, columns: [{name, type}] }
 * @returns {Array<{from, to, confidence, reason}>}
 */
function detectRelationships(tableA, tableB) {
    const suggestions = [];
    const colsA = (tableA.columns || []).map(c => typeof c === 'string' ? { name: c, type: '' } : c);
    const colsB = (tableB.columns || []).map(c => typeof c === 'string' ? { name: c, type: '' } : c);

    // Strategy 1: FK pattern — tableB has column named tableA_singular + '_id'
    const singularA = tableA.name.replace(/s$/, '').toLowerCase();
    const singularB = tableB.name.replace(/s$/, '').toLowerCase();

    for (const col of colsB) {
        const cn = col.name.toLowerCase();
        if (cn === singularA + '_id' || cn === singularA + 'id') {
            const pkCol = colsA.find(c => c.name.toLowerCase() === 'id');
            if (pkCol) {
                suggestions.push({ from: `${tableA.name}.id`, to: `${tableB.name}.${col.name}`, confidence: 0.95, reason: `FK pattern: ${tableB.name}.${col.name} references ${tableA.name}.id` });
            }
        }
    }

    for (const col of colsA) {
        const cn = col.name.toLowerCase();
        if (cn === singularB + '_id' || cn === singularB + 'id') {
            const pkCol = colsB.find(c => c.name.toLowerCase() === 'id');
            if (pkCol) {
                suggestions.push({ from: `${tableA.name}.${col.name}`, to: `${tableB.name}.id`, confidence: 0.95, reason: `FK pattern: ${tableA.name}.${col.name} references ${tableB.name}.id` });
            }
        }
    }

    // Strategy 2: Same column name ending in _id
    for (const colA of colsA) {
        if (!colA.name.toLowerCase().endsWith('_id') && colA.name.toLowerCase() !== 'id') continue;
        for (const colB of colsB) {
            if (colA.name.toLowerCase() === colB.name.toLowerCase() && colA.name.toLowerCase() !== 'id') {
                suggestions.push({ from: `${tableA.name}.${colA.name}`, to: `${tableB.name}.${colB.name}`, confidence: 0.85, reason: `Shared key: both tables have ${colA.name}` });
            }
        }
    }

    // Strategy 3: Name similarity (e.g., user_email ↔ email, customer_id ↔ id)
    for (const colA of colsA) {
        for (const colB of colsB) {
            const a = colA.name.toLowerCase();
            const b = colB.name.toLowerCase();
            if (a === b) continue; // Already handled
            if (a === 'id' || b === 'id') continue;

            // Check if one contains the other (e.g., user_id contains user)
            if ((a.includes(singularB) && a.endsWith('_id')) || (b.includes(singularA) && b.endsWith('_id'))) {
                // Already handled in Strategy 1
                continue;
            }

            // Same semantic meaning (email ↔ user_email, name ↔ customer_name)
            if (a.replace(/^.*_/, '') === b.replace(/^.*_/, '') && /email|phone|name|code|ref/.test(a)) {
                suggestions.push({ from: `${tableA.name}.${colA.name}`, to: `${tableB.name}.${colB.name}`, confidence: 0.6, reason: `Semantic match: ${colA.name} ≈ ${colB.name}` });
            }
        }
    }

    // Deduplicate and sort by confidence
    const seen = new Set();
    return suggestions.filter(s => {
        const key = `${s.from}-${s.to}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Detect relationships across ALL tables in a schema.
 * @param {Object} schema - { tables: { name: { columns } } }
 * @returns {Array<{from, to, confidence, reason}>}
 */
function detectAllRelationships(schema) {
    const tables = Object.entries(schema.tables || {}).map(([name, info]) => ({
        name,
        columns: (info.columns || []).map(c => typeof c === 'string' ? { name: c, type: '' } : c)
    }));

    const allSuggestions = [];
    for (let i = 0; i < tables.length; i++) {
        for (let j = i + 1; j < tables.length; j++) {
            const rels = detectRelationships(tables[i], tables[j]);
            allSuggestions.push(...rels);
        }
    }

    return allSuggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Parse natural language JOIN request and find best matching condition.
 * @param {string} query - e.g., "join users with orders"
 * @param {Object} schema - Database schema
 * @returns {{ tableA, tableB, joinCondition, confidence, reason }|null}
 */
function parseNaturalJoin(query, schema) {
    const q = query.toLowerCase();
    const tables = Object.keys(schema.tables || {});

    // Extract table names from query
    let tableA = null, tableB = null;
    for (const t of tables) {
        const tl = t.toLowerCase();
        const singular = tl.replace(/s$/, '');
        if (q.includes(tl) || q.includes(singular)) {
            if (!tableA) tableA = t;
            else if (!tableB && t !== tableA) tableB = t;
        }
    }

    // Try pattern: "join X with Y", "X and Y", "between X and Y"
    if (!tableA || !tableB) {
        const match = q.match(/(?:join|combine|merge|link)\s+(\w+)\s+(?:with|and|to)\s+(\w+)/i);
        if (match) {
            const a = tables.find(t => t.toLowerCase().includes(match[1]));
            const b = tables.find(t => t.toLowerCase().includes(match[2]));
            if (a) tableA = a;
            if (b) tableB = b;
        }
    }

    if (!tableA || !tableB) return null;

    // Find relationship between the two tables
    const tA = { name: tableA, columns: (schema.tables[tableA]?.columns || []).map(c => typeof c === 'string' ? { name: c, type: '' } : c) };
    const tB = { name: tableB, columns: (schema.tables[tableB]?.columns || []).map(c => typeof c === 'string' ? { name: c, type: '' } : c) };
    const rels = detectRelationships(tA, tB);

    if (rels.length === 0) {
        return { tableA, tableB, joinCondition: null, confidence: 0, reason: 'No matching columns found between these tables.' };
    }

    const best = rels[0];
    return {
        tableA,
        tableB,
        joinCondition: `${best.from} = ${best.to}`,
        confidence: best.confidence,
        reason: best.reason,
        allSuggestions: rels
    };
}

/**
 * Find compatible columns between two tables (for highlighting in UI).
 * @param {Object} tableA - { name, columns }
 * @param {Object} tableB - { name, columns }
 * @returns {Array<{colA, colB, matchType, confidence}>}
 */
function findCompatibleColumns(tableA, tableB) {
    const colsA = (tableA.columns || []).map(c => typeof c === 'string' ? { name: c, type: '' } : c);
    const colsB = (tableB.columns || []).map(c => typeof c === 'string' ? { name: c, type: '' } : c);
    const matches = [];

    for (const a of colsA) {
        for (const b of colsB) {
            const an = a.name.toLowerCase();
            const bn = b.name.toLowerCase();

            // Exact name match
            if (an === bn) {
                matches.push({ colA: a.name, colB: b.name, matchType: 'exact', confidence: 0.9 });
            }
            // FK pattern
            else if (an === tableB.name.replace(/s$/, '').toLowerCase() + '_id' && bn === 'id') {
                matches.push({ colA: a.name, colB: b.name, matchType: 'fk', confidence: 0.95 });
            }
            else if (bn === tableA.name.replace(/s$/, '').toLowerCase() + '_id' && an === 'id') {
                matches.push({ colA: a.name, colB: b.name, matchType: 'fk', confidence: 0.95 });
            }
            // Same suffix (e.g., user_email ↔ email)
            else if (an.endsWith('_' + bn) || bn.endsWith('_' + an)) {
                matches.push({ colA: a.name, colB: b.name, matchType: 'partial', confidence: 0.6 });
            }
        }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
}

module.exports = { detectRelationships, detectAllRelationships, parseNaturalJoin, findCompatibleColumns };
