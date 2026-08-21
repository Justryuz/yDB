/**
 * @file routes/nlq.js
 * @description Natural Language Query API — Text-to-SQL BI Copilot.
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
 * Returns suggested questions based on schema.
 */
router.post('/suggest', async (req, res) => {
    try {
        const { connectionId } = req.body;
        if (!connectionId) {
            return res.status(400).json({ error: 'connectionId required' });
        }

        const db = require('../db/pool');
        const connResult = await db.query(
            'SELECT db_type, database_name FROM connections WHERE id = $1 AND user_id = $2',
            [connectionId, req.user.id]
        );
        if (!connResult.rows.length) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const conn = connResult.rows[0];

        // Generate smart suggestions based on DB type
        const suggestions = [
            `Berapa jumlah rekod dalam database?`,
            `Tunjukkan 10 data terkini`,
            `Senaraikan semua jadual`,
            `Berapa jumlah mengikut status?`,
            `Top 5 rekod tertinggi`,
            `Data mengikut bulan`,
            `Show total count per category`,
            `What are the latest 20 records?`
        ];

        res.json({ suggestions, dbType: conn.db_type, database: conn.database_name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
