/**
 * @file services/sql-assistant.js
 * @description AI SQL Assistant — fix errors, explain queries, optimize, generate SQL.
 *
 * Works in two modes:
 *  - LLM mode (bedrock/openai): Full AI-powered SQL assistance
 *  - Builtin mode: Pattern-based suggestions for common errors
 *
 * Endpoints:
 *  - fix: Takes SQL + error message → returns corrected SQL
 *  - explain: Takes SQL → returns plain English explanation
 *  - optimize: Takes SQL → returns optimized version with explanation
 *  - generate: Takes natural language → returns SQL (uses NLQ engine)
 */

const aiProvider = require('./ai-provider');

class SQLAssistant {
    constructor(schema, dbType) {
        this.schema = schema;
        this.dbType = dbType;
        this.schemaContext = this._buildDDL();
    }

    /**
     * Fix a SQL query based on error message.
     */
    async fix(sql, errorMessage) {
        return this._withLLM(
            `Fix this ${this.dbType} SQL query that produced an error.\n\nSQL:\n${sql}\n\nError:\n${errorMessage}\n\nDatabase schema:\n${this.schemaContext}\n\nReturn JSON: {"sql": "fixed query", "explanation": "what was wrong and what was fixed"}`,
            () => this._builtinFix(sql, errorMessage)
        );
    }

    /**
     * Explain what a SQL query does in plain English.
     */
    async explain(sql) {
        return this._withLLM(
            `Explain this ${this.dbType} SQL query in plain English. Be concise but thorough.\n\nSQL:\n${sql}\n\nSchema context:\n${this.schemaContext}\n\nReturn JSON: {"explanation": "plain English explanation of what this query does, what tables it touches, and what the result will look like"}`,
            () => this._builtinExplain(sql)
        );
    }

    /**
     * Suggest optimizations for a SQL query.
     */
    async optimize(sql) {
        return this._withLLM(
            `Optimize this ${this.dbType} SQL query for better performance.\n\nSQL:\n${sql}\n\nSchema:\n${this.schemaContext}\n\nReturn JSON: {"sql": "optimized query", "explanation": "what was optimized and why it's faster", "suggestions": ["index suggestion 1", "index suggestion 2"]}`,
            () => this._builtinOptimize(sql)
        );
    }

    /**
     * Generate SQL from natural language description.
     */
    async generate(description) {
        return this._withLLM(
            `Generate a ${this.dbType} SQL query for this request:\n\n"${description}"\n\nDatabase schema:\n${this.schemaContext}\n\nReturn JSON: {"sql": "SELECT ...", "explanation": "what this query does"}`,
            () => this._builtinGenerate(description)
        );
    }

    // ── LLM Integration (via central provider, with builtin fallback) ──

    /**
     * Run a prompt through the configured LLM. If AI is disabled or the call
     * fails, fall back to the builtin pattern-based implementation so the
     * feature keeps working offline.
     * @param {string} prompt
     * @param {Function} builtinFn - returns the builtin result
     */
    async _withLLM(prompt, builtinFn) {
        if (!(await aiProvider.isEnabled())) {
            return builtinFn();
        }
        try {
            const result = await aiProvider.completeJSON(prompt);
            // If parsing produced nothing useful, fall back.
            if (!result || (result._raw !== undefined && !result.sql && !result.explanation)) {
                const fallback = builtinFn();
                fallback.explanation = (result._raw || fallback.explanation || '').toString().slice(0, 500) || fallback.explanation;
                return fallback;
            }
            return result;
        } catch (err) {
            console.error('[SQL-Assistant] LLM error, using builtin fallback:', err.message);
            const fallback = builtinFn();
            fallback.aiError = err.message;
            return fallback;
        }
    }

    // ── Builtin Pattern-Based Assistance ──

    _builtinFix(sql, error) {
        const errLower = error.toLowerCase();
        let fixed = sql;
        let explanation = '';

        // Unknown column
        if (errLower.includes('unknown column') || errLower.includes('does not exist')) {
            const colMatch = error.match(/['"]([^'"]+)['"]/);
            if (colMatch) {
                explanation = `Column "${colMatch[1]}" does not exist in the table. Check column name spelling or use correct table prefix.`;
            }
        }
        // Table not found
        else if (errLower.includes('table') && (errLower.includes('not exist') || errLower.includes('not found') || errLower.includes('unknown'))) {
            const tableMatch = error.match(/['"]([^'"]+)['"]/);
            explanation = `Table "${tableMatch?.[1] || '?'}" not found. Available tables: ${Object.keys(this.schema?.tables || {}).join(', ')}`;
        }
        // Syntax error
        else if (errLower.includes('syntax') || errLower.includes('parse error')) {
            explanation = 'SQL syntax error detected. Common fixes: check for missing commas, unmatched quotes, or incorrect keywords.';
            // Try to fix common issues
            fixed = sql.replace(/,,/g, ',').replace(/\s+,\s*FROM/gi, ' FROM');
        }
        // Group by
        else if (errLower.includes('group by') || errLower.includes('aggregate')) {
            explanation = 'Columns in SELECT must be in GROUP BY or inside an aggregate function (COUNT, SUM, AVG, etc.)';
            const selectCols = sql.match(/SELECT\s+(.*?)\s+FROM/i);
            if (selectCols) {
                const cols = selectCols[1].split(',').map(c => c.trim()).filter(c => !/count|sum|avg|min|max/i.test(c));
                if (cols.length > 0) {
                    fixed = sql.replace(/;?\s*$/, '') + ' GROUP BY ' + cols.join(', ');
                }
            }
        }
        // Ambiguous column
        else if (errLower.includes('ambiguous')) {
            explanation = 'Column name exists in multiple tables. Prefix it with the table name (e.g., users.id instead of just id).';
        }
        // Permission denied
        else if (errLower.includes('permission') || errLower.includes('access denied')) {
            explanation = 'Access denied. The database user may not have permission to access this table or perform this operation.';
        }
        else {
            explanation = 'Error: ' + error + '. Review the SQL and check table/column names against the schema.';
        }

        return { sql: fixed, explanation, originalError: error };
    }

    _builtinExplain(sql) {
        const parts = [];
        const upper = sql.toUpperCase();

        if (upper.includes('SELECT')) {
            const fromMatch = sql.match(/FROM\s+(\w+)/i);
            parts.push(`Retrieves data from ${fromMatch ? fromMatch[1] : 'a table'}`);
        }
        if (upper.includes('WHERE')) parts.push('with filtering conditions');
        if (upper.includes('JOIN')) parts.push('joining multiple tables');
        if (upper.includes('GROUP BY')) parts.push('grouped by specific columns');
        if (upper.includes('ORDER BY')) parts.push('sorted in specific order');
        if (upper.includes('LIMIT')) {
            const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
            parts.push(`limited to ${limitMatch ? limitMatch[1] : 'N'} rows`);
        }
        if (/COUNT|SUM|AVG|MIN|MAX/i.test(upper)) parts.push('with aggregate calculations');

        return { explanation: parts.length > 0 ? 'This query ' + parts.join(', ') + '.' : 'SQL query.' };
    }

    _builtinOptimize(sql) {
        const suggestions = [];
        const upper = sql.toUpperCase();

        if (upper.includes('SELECT *')) {
            suggestions.push('Replace SELECT * with specific column names to reduce data transfer');
        }
        if (!upper.includes('LIMIT') && !upper.includes('COUNT') && !upper.includes('SUM')) {
            suggestions.push('Add LIMIT clause to prevent fetching too many rows');
        }
        if (upper.includes('WHERE') && upper.includes('LIKE')) {
            suggestions.push('LIKE with leading wildcard (%) cannot use indexes — consider full-text search');
        }
        if (upper.includes('ORDER BY') && !upper.includes('LIMIT')) {
            suggestions.push('ORDER BY without LIMIT sorts all rows — add LIMIT for better performance');
        }
        if ((sql.match(/JOIN/gi) || []).length > 2) {
            suggestions.push('Multiple JOINs detected — ensure JOIN columns are indexed');
        }

        let optimized = sql;
        if (upper.includes('SELECT *') && this.schema?.tables) {
            const tableMatch = sql.match(/FROM\s+(\w+)/i);
            if (tableMatch && this.schema.tables[tableMatch[1]]) {
                const cols = (this.schema.tables[tableMatch[1]].columns || [])
                    .map(c => c.name || c)
                    .filter(c => !/password|hash|token|secret/i.test(c))
                    .slice(0, 10);
                if (cols.length > 0) {
                    optimized = sql.replace(/SELECT\s+\*/i, 'SELECT ' + cols.join(', '));
                }
            }
        }

        return { sql: optimized, explanation: suggestions.length > 0 ? suggestions.join('. ') + '.' : 'Query looks reasonable. No major optimizations needed.', suggestions };
    }

    _builtinGenerate(description) {
        // Use NLQ engine's heuristic
        const { SchemaIntelligence, QueryPlanner } = require('./nlq');
        const si = new SchemaIntelligence(this.schema, this.dbType);
        const planner = new QueryPlanner(description, si, this.dbType);
        const plan = planner.buildPlan();
        return { sql: plan.sql || '', explanation: plan.explanation || '' };
    }

    _buildDDL() {
        if (!this.schema?.tables) return '-- No schema';
        let ddl = '';
        for (const [t, info] of Object.entries(this.schema.tables)) {
            const cols = (info.columns || []).map(c => `${c.name || c} ${c.type || 'TEXT'}`).join(', ');
            ddl += `CREATE TABLE ${t} (${cols});\n`;
        }
        return ddl;
    }
}

module.exports = SQLAssistant;
