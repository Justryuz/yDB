/**
 * @file routes/ai.js
 * @description New AI feature endpoints built on ai-features + ai-provider:
 *   POST /api/ai/explain-error   — plain-language cause + fix for a failed query
 *   POST /api/ai/document-schema — auto-generated schema documentation
 *   POST /api/ai/advise-indexes  — index/performance recommendations
 *   GET  /api/ai/ask-stream      — streaming NLQ answer over SSE
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const aiFeatures = require('../services/ai-features');
const aiProvider = require('../services/ai-provider');
const connCtx = require('../services/connection-context');
const { processQuestion } = require('../services/nlq');
const { logFromRequest } = require('../services/audit-log');

router.use(authenticate);

/**
 * POST /api/ai/explain-error
 * Body: { connectionId?, sql, error }
 */
router.post('/explain-error', async (req, res) => {
    try {
        const { connectionId, sql, error } = req.body || {};
        if (!sql || !error) return res.status(400).json({ error: 'sql and error required' });
        const { schema, dbType } = await connCtx.getSchema(connectionId, req.user.id);
        const result = await aiFeatures.explainError(sql, error, schema, dbType);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/document-schema
 * Body: { connectionId }
 */
router.post('/document-schema', async (req, res) => {
    try {
        const { connectionId } = req.body || {};
        if (!connectionId) return res.status(400).json({ error: 'connectionId required' });
        const { schema, dbType } = await connCtx.getSchema(connectionId, req.user.id);
        const result = await aiFeatures.documentSchema(schema, dbType);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/advise-indexes
 * Body: { connectionId?, sql, runExplain? }
 * When runExplain is true and a connection is given, runs EXPLAIN and feeds it to the advisor.
 */
router.post('/advise-indexes', async (req, res) => {
    try {
        const { connectionId, sql, runExplain } = req.body || {};
        if (!sql) return res.status(400).json({ error: 'sql required' });
        const { schema, dbType } = await connCtx.getSchema(connectionId, req.user.id);

        let explainOutput = null;
        if (runExplain && connectionId) {
            let cleanup = () => {};
            try {
                const ctx = await connCtx.openAdapter(connectionId, req.user.id);
                cleanup = ctx.cleanup;
                const prefix = (dbType === 'postgresql' || dbType === 'postgres') ? 'EXPLAIN (FORMAT JSON) ' : 'EXPLAIN ';
                const r = await ctx.adapter.query(prefix + sql);
                explainOutput = r.data;
            } catch (e) {
                explainOutput = `EXPLAIN failed: ${e.message}`;
            } finally {
                cleanup();
            }
        }

        const result = await aiFeatures.adviseIndexes(sql, explainOutput, schema, dbType);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/ask-stream?connectionId=..&question=..
 * Server-Sent Events. Emits progress events then a final result event.
 * (Token from Authorization header or ?token= — see authenticate middleware.)
 */
router.get('/ask-stream', async (req, res) => {
    const { connectionId, question } = req.query;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        if (!connectionId || !question || question.trim().length < 3) {
            send('error', { error: 'connectionId and a question (min 3 chars) are required' });
            return res.end();
        }

        send('status', { stage: 'analyzing', message: 'Understanding your question…' });
        const usingLLM = await aiProvider.isEnabled();
        send('status', { stage: 'generating', message: usingLLM ? 'Generating SQL with AI…' : 'Generating SQL…' });

        const result = await processQuestion(req.user.id, connectionId, question.trim());

        send('status', { stage: 'done', message: 'Complete' });
        send('result', result);

        await logFromRequest(req, 'nlq.query_stream', 'nlq', {
            connectionId,
            queryText: result.sql,
            status: result.success ? 'success' : 'failure',
            rowsAffected: result.rowCount,
            details: { question, streamed: true }
        });
    } catch (err) {
        send('error', { error: err.message });
    } finally {
        res.end();
    }
});

module.exports = router;
