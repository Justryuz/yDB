/**
 * @file services/ai-features.js
 * @description Higher-level AI features built on the central ai-provider, each
 * with a builtin fallback so they work even when no LLM is configured.
 *
 *  - explainError(sql, error, schema, dbType) : plain-language cause + fix
 *  - documentSchema(schema, dbType)           : per-table/column descriptions
 *  - adviseIndexes(sql, explainOutput, schema, dbType) : index recommendations
 */

const aiProvider = require('./ai-provider');

function buildDDL(schema, dbType) {
    if (!schema?.tables) return `-- No schema (${dbType})`;
    let ddl = `-- Database: ${dbType}\n`;
    for (const [t, info] of Object.entries(schema.tables)) {
        const cols = (info.columns || []).map(c => `  ${c.name || c} ${c.type || 'TEXT'}${c.key === 'PK' ? ' PRIMARY KEY' : ''}`);
        ddl += `\nCREATE TABLE ${t} (\n${cols.join(',\n')}\n);\n`;
    }
    return ddl;
}

// ── AI Error Explainer ───────────────────────────────────────────────────────

async function explainError(sql, error, schema, dbType) {
    if (await aiProvider.isEnabled()) {
        try {
            const prompt = `A ${dbType} SQL query failed. Explain the cause in plain language and give a corrected query.\n\nSQL:\n${sql}\n\nError:\n${error}\n\nSchema:\n${buildDDL(schema, dbType)}\n\nReturn JSON: {"cause": "why it failed, in plain language", "fix": "how to fix it", "sql": "corrected query"}`;
            const r = await aiProvider.completeJSON(prompt);
            if (r && (r.cause || r.sql)) return { ...r, provider: 'llm' };
        } catch (e) { /* fall through to builtin */ }
    }
    return { ...builtinExplainError(sql, error, schema), provider: 'builtin' };
}

function builtinExplainError(sql, error, schema) {
    const e = (error || '').toLowerCase();
    const tables = Object.keys(schema?.tables || {});
    let cause = 'The query could not be executed.';
    let fix = 'Review the SQL against the schema.';

    if (e.includes('syntax')) {
        cause = 'There is a SQL syntax error — a keyword, comma, or quote is likely misplaced.';
        fix = 'Check for missing commas, unbalanced quotes/parentheses, and correct keyword order.';
    } else if (e.includes('exist') || e.includes('unknown') || e.includes('not found')) {
        const m = (error || '').match(/['"`]([^'"`]+)['"`]/);
        cause = `A referenced ${e.includes('column') ? 'column' : 'table'} ${m ? `"${m[1]}" ` : ''}does not exist.`;
        fix = `Available tables: ${tables.join(', ') || '(none detected)'}. Check spelling and qualify names with the table.`;
    } else if (e.includes('ambiguous')) {
        cause = 'A column name exists in more than one joined table.';
        fix = 'Prefix the column with its table name, e.g. users.id.';
    } else if (e.includes('group by') || e.includes('aggregate')) {
        cause = 'Non-aggregated columns in SELECT must appear in GROUP BY.';
        fix = 'Add the selected columns to GROUP BY or wrap them in an aggregate (COUNT, SUM, ...).';
    } else if (e.includes('permission') || e.includes('denied')) {
        cause = 'The database user lacks permission for this table or operation.';
        fix = 'Use an account with the required privileges, or choose a table you can access.';
    } else {
        cause = 'Error: ' + (error || 'unknown');
    }
    return { cause, fix, sql };
}

// ── AI Schema Documentation ──────────────────────────────────────────────────

async function documentSchema(schema, dbType) {
    if (await aiProvider.isEnabled()) {
        try {
            const prompt = `Document this ${dbType} database for a new developer. For each table give a one-line purpose, and for each column a short description. Infer meaning from names.\n\n${buildDDL(schema, dbType)}\n\nReturn JSON: {"tables": {"<table>": {"purpose": "...", "columns": {"<col>": "description"}}}}`;
            const r = await aiProvider.completeJSON(prompt);
            if (r && r.tables) return { ...r, provider: 'llm' };
        } catch (e) { /* fall through */ }
    }
    return { ...builtinDocumentSchema(schema), provider: 'builtin' };
}

function builtinDocumentSchema(schema) {
    const out = { tables: {} };
    for (const [t, info] of Object.entries(schema?.tables || {})) {
        const cols = {};
        for (const col of (info.columns || [])) {
            const name = col.name || col;
            cols[name] = describeColumn(name, col.type);
        }
        out.tables[t] = { purpose: `Stores ${t.replace(/_/g, ' ')} records.`, columns: cols };
    }
    return out;
}

function describeColumn(name, type) {
    const n = String(name).toLowerCase();
    if (n === 'id' || n.endsWith('_id')) return n === 'id' ? 'Primary identifier for the row.' : `Reference to ${n.replace(/_id$/, '').replace(/_/g, ' ')}.`;
    if (/email/.test(n)) return 'Email address.';
    if (/name|title/.test(n)) return 'Human-readable name/label.';
    if (/created|updated|_at$|date|time/.test(n)) return 'Timestamp/date value.';
    if (/status|state|type|role|category/.test(n)) return 'Categorical status/type value.';
    if (/amount|price|total|cost|balance|salary|fee/.test(n)) return 'Monetary/numeric amount.';
    if (/count|qty|quantity|number/.test(n)) return 'Numeric count/quantity.';
    if (/active|enabled|is_|has_/.test(n)) return 'Boolean flag.';
    return `${type || 'Value'} column.`;
}

// ── AI Index / Performance Advisor ───────────────────────────────────────────

async function adviseIndexes(sql, explainOutput, schema, dbType) {
    if (await aiProvider.isEnabled()) {
        try {
            const explainCtx = explainOutput ? `\n\nEXPLAIN output:\n${typeof explainOutput === 'string' ? explainOutput : JSON.stringify(explainOutput).slice(0, 2000)}` : '';
            const prompt = `Recommend indexes and rewrites to speed up this ${dbType} query. Be specific with CREATE INDEX statements.\n\nSQL:\n${sql}${explainCtx}\n\nSchema:\n${buildDDL(schema, dbType)}\n\nReturn JSON: {"recommendations": [{"type": "index|rewrite", "detail": "...", "ddl": "CREATE INDEX ... (optional)"}], "summary": "..."}`;
            const r = await aiProvider.completeJSON(prompt);
            if (r && r.recommendations) return { ...r, provider: 'llm' };
        } catch (e) { /* fall through */ }
    }
    return { ...builtinAdviseIndexes(sql, schema, dbType), provider: 'builtin' };
}

function builtinAdviseIndexes(sql, schema, dbType) {
    const recommendations = [];
    const upper = (sql || '').toUpperCase();
    const q = (dbType === 'mysql' || dbType === 'mariadb') ? '`' : '"';

    // Columns used in WHERE / JOIN / ORDER BY are index candidates.
    const whereCols = [...(sql || '').matchAll(/\bWHERE\b([\s\S]*?)(\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/gi)]
        .flatMap(m => [...m[1].matchAll(/([a-zA-Z_][\w.]*)\s*(?:=|>|<|>=|<=|LIKE|IN)/gi)].map(x => x[1]));
    const joinCols = [...(sql || '').matchAll(/\bON\b\s+([\w.]+)\s*=\s*([\w.]+)/gi)].flatMap(m => [m[1], m[2]]);
    const orderCols = [...(sql || '').matchAll(/\bORDER\s+BY\s+([\w.,\s]+)/gi)].flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+/)[0]));

    const candidates = [...new Set([...whereCols, ...joinCols, ...orderCols])]
        .map(c => c.includes('.') ? c.split('.').pop() : c)
        .filter(Boolean);

    const fromMatch = (sql || '').match(/\bFROM\s+([a-zA-Z_]\w*)/i);
    const table = fromMatch ? fromMatch[1] : null;

    for (const col of candidates.slice(0, 5)) {
        recommendations.push({
            type: 'index',
            detail: `Column "${col}" is used for filtering/joining/sorting — an index may help.`,
            ddl: table ? `CREATE INDEX idx_${table}_${col} ON ${q}${table}${q} (${q}${col}${q});` : ''
        });
    }
    if (upper.includes('SELECT *')) {
        recommendations.push({ type: 'rewrite', detail: 'Avoid SELECT * — list only needed columns to reduce I/O.', ddl: '' });
    }
    if (upper.includes('LIKE') && /LIKE\s+'%/.test(upper)) {
        recommendations.push({ type: 'rewrite', detail: 'Leading-wildcard LIKE cannot use a B-tree index; consider full-text search.', ddl: '' });
    }

    return {
        recommendations,
        summary: recommendations.length ? `${recommendations.length} suggestion(s) based on query structure.` : 'No obvious index opportunities detected.'
    };
}

module.exports = { explainError, documentSchema, adviseIndexes, buildDDL };
