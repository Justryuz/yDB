/**
 * @file routes/nlq.js
 * @description Natural Language Query API — Text-to-SQL Copilot.
 * Accepts business questions in natural language, returns SQL + results + chart suggestions.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { processQuestion } = require('../services/nlq');
const { logFromRequest } = require('../services/audit-log');

router.use(authenticate);

/**
 * POST /api/nlq/ask
 * Body: { connectionId, question }
 * Returns: { success, question, sql, explanation, chartType, columns, data, rowCount }
 */
router.post('/ask', async (req, res) => {
    try {
        const { connectionId, question } = req.body;

        if (!connectionId) {
            return res.status(400).json({ error: 'connectionId required. Please select a database connection.' });
        }
        if (!question || question.trim().length < 3) {
            return res.status(400).json({ error: 'Please ask a question (minimum 3 characters).' });
        }

        const result = await processQuestion(req.user.id, connectionId, question.trim());

        // Audit log
        await logFromRequest(req, 'nlq.query', 'nlq', {
            connectionId,
            queryText: result.sql,
            status: result.success ? 'success' : 'failure',
            durationMs: result.duration,
            rowsAffected: result.rowCount,
            details: { question, chartType: result.chartType }
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
            question: req.body?.question || ''
        });
    }
});

/**
 * POST /api/nlq/suggest
 * Body: { connectionId }
 * Returns smart suggested questions based on actual database schema analysis.
 * Analyzes tables, columns, data types to suggest relevant queries.
 */
router.post('/suggest', async (req, res) => {
    try {
        const { connectionId } = req.body;
        if (!connectionId) {
            return res.status(400).json({ error: 'connectionId required' });
        }

        const db = require('../db/pool');
        const crypto = require('crypto');
        const config = require('../config');
        const poolManager = require('../services/pool-manager');
        const { withTunnel } = require('../services/ssh-tunnel');

        const connResult = await db.query(
            'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
            [connectionId, req.user.id]
        );
        if (!connResult.rows.length) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const conn = connResult.rows[0];
        let password = '';
        try {
            const key = crypto.scryptSync(config.encryptionKey, 'salt', 32);
            if (conn.password_encrypted) {
                const [ivHex, encrypted] = conn.password_encrypted.split(':');
                const iv = Buffer.from(ivHex, 'hex');
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                password = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
            }
        } catch (e) { /* proceed without password */ }

        const options = conn.options || {};
        const { opts, cleanup } = await withTunnel(
            { host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name },
            options.ssh
        );

        let schema, adapter;
        try {
            adapter = await poolManager.getAdapter(connectionId, conn.db_type, opts);
            schema = await adapter.getSchema();
        } catch (err) {
            cleanup();
            return res.json({ suggestions: ['How many records are there?', 'Show latest 20 records'], tables: [], dbType: conn.db_type });
        }

        // Check which tables have data (skip empty ones from suggestions)
        const tablesWithData = {};
        for (const [tableName, tableInfo] of Object.entries(schema.tables || {})) {
            try {
                const countResult = await adapter.query(`SELECT COUNT(*) AS c FROM ${tableName}`);
                const count = parseInt(countResult.data?.[0]?.c || countResult.data?.[0]?.C || 0);
                if (count > 0) {
                    tablesWithData[tableName] = { ...tableInfo, rowCount: count };
                }
            } catch (e) {
                // Skip tables we can't count (views, etc.)
            }
        }
        cleanup();

        // Generate suggestions only for tables with data
        const filteredSchema = { tables: tablesWithData };
        const suggestions = generateSmartSuggestions(filteredSchema, conn.db_type);

        res.json({
            suggestions: suggestions.questions,
            categories: suggestions.categories,
            tables: Object.keys(schema.tables || {}),
            dbType: conn.db_type,
            database: conn.database_name
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Generate smart suggestions by analyzing the database schema.
 * Groups suggestions into categories: counts, aggregations, trends, breakdowns, lists.
 */
function generateSmartSuggestions(schema, dbType) {
    const tables = Object.entries(schema.tables || {});
    const questions = [];
    const categories = [];

    for (const [tableName, tableInfo] of tables) {
        const cols = (tableInfo.columns || []).map(c => c.name || c);
        const readableName = tableName.replace(/_/g, ' ');

        // Detect column types
        const dateCols = cols.filter(c => /date|created|time|updated|registered|joined|timestamp/i.test(c));
        const amountCols = cols.filter(c => /amount|total|price|revenue|sales|value|fee|commission|balance|subtotal|gross|cost|salary|earning/i.test(c));
        const statusCols = cols.filter(c => /^status$|^state$|^type$|^role$|^category$|^level$/i.test(c));
        const nameCols = cols.filter(c => /name|nama|title|label|username|email|company/i.test(c));

        // COUNT suggestion
        questions.push({ q: `How many ${readableName}?`, category: 'count', table: tableName });

        // SUM suggestions for amount columns
        for (const col of amountCols.slice(0, 2)) {
            questions.push({ q: `Total ${col} from ${readableName}`, category: 'sum', table: tableName });
        }

        // TREND suggestions if date + amount columns exist
        if (dateCols.length > 0) {
            if (amountCols.length > 0) {
                questions.push({ q: `Monthly ${amountCols[0]} trend from ${readableName}`, category: 'trend', table: tableName });
            } else {
                questions.push({ q: `Monthly trend of ${readableName}`, category: 'trend', table: tableName });
            }
        }

        // BREAKDOWN suggestions for status/type columns
        for (const col of statusCols.slice(0, 1)) {
            questions.push({ q: `Breakdown of ${readableName} by ${col}`, category: 'breakdown', table: tableName });
        }

        // TOP-N suggestions if amount columns exist
        if (amountCols.length > 0 && nameCols.length > 0) {
            questions.push({ q: `Top 10 ${readableName} by ${amountCols[0]}`, category: 'ranking', table: tableName });
        }

        // RECENT data
        if (dateCols.length > 0) {
            questions.push({ q: `Latest 10 ${readableName}`, category: 'recent', table: tableName });
        }
    }

    // Build categories
    const catSet = new Set(questions.map(q => q.category));
    for (const cat of catSet) {
        const label = { count: 'Counts', sum: 'Totals', trend: 'Trends', breakdown: 'Breakdowns', ranking: 'Rankings', recent: 'Recent' }[cat] || cat;
        categories.push({ id: cat, label });
    }

    // Limit to most useful suggestions (max 20)
    const prioritized = [];
    for (const cat of ['count', 'sum', 'trend', 'breakdown', 'ranking', 'recent']) {
        const catItems = questions.filter(q => q.category === cat).slice(0, 4);
        prioritized.push(...catItems);
    }

    return { questions: prioritized.slice(0, 20), categories };
}

module.exports = router;
