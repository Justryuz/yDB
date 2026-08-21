/**
 * @file services/nlq.js
 * @description Natural Language Query (NLQ) / Text-to-SQL service.
 * Takes a natural language question + database schema context,
 * generates SQL, executes it, and returns structured results.
 *
 * This is the core AI layer for the BI Copilot feature.
 * Supports pluggable LLM backends (Amazon Q, OpenAI, local).
 */

const crypto = require('crypto');
const config = require('../config');
const db = require('../db/pool');
const poolManager = require('./pool-manager');
const { withTunnel } = require('./ssh-tunnel');

/**
 * Built-in Text-to-SQL engine using pattern matching + schema awareness.
 * This serves as the default when no external LLM API is configured.
 * For production, replace with Amazon Bedrock / Amazon Q API calls.
 */
class NLQEngine {
    constructor() {
        // Conversation history per user (in-memory, short-lived)
        this.conversations = new Map();
    }

    /**
     * Process a natural language question against a database connection.
     * @param {Object} opts
     * @param {string} opts.question - Natural language question
     * @param {Object} opts.schema - Database schema { tables: { name: { columns } } }
     * @param {string} opts.dbType - Database type (postgresql, mysql, etc.)
     * @param {number} opts.userId - User ID for conversation context
     * @param {string} [opts.language='auto'] - Language hint
     * @returns {Promise<{ sql: string, explanation: string, chartType: string }>}
     */
    async generateSQL(opts) {
        const { question, schema, dbType, userId } = opts;
        const tables = Object.keys(schema.tables || {});
        const q = question.toLowerCase().trim();

        // Build schema context string for prompt
        const schemaContext = this._buildSchemaContext(schema);

        // Try external LLM first (Amazon Bedrock / Q)
        if (config.nlq && config.nlq.provider !== 'builtin') {
            return await this._callExternalLLM(question, schemaContext, dbType);
        }

        // Built-in heuristic SQL generation
        return this._heuristicGenerate(q, schema, tables, dbType);
    }

    /**
     * Call external LLM API (Amazon Bedrock, OpenAI, etc.)
     * @private
     */
    async _callExternalLLM(question, schemaContext, dbType) {
        const provider = config.nlq?.provider || 'builtin';

        if (provider === 'bedrock') {
            return await this._callBedrock(question, schemaContext, dbType);
        }

        if (provider === 'openai') {
            return await this._callOpenAI(question, schemaContext, dbType);
        }

        // Fallback to built-in
        return this._heuristicGenerate(question.toLowerCase(), {}, [], dbType);
    }

    /**
     * Amazon Bedrock integration (Claude / Titan)
     * @private
     */
    async _callBedrock(question, schemaContext, dbType) {
        try {
            const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
            const client = new BedrockRuntimeClient({
                region: config.nlq?.region || 'us-east-1'
            });

            const prompt = this._buildPrompt(question, schemaContext, dbType);

            const command = new InvokeModelCommand({
                modelId: config.nlq?.model || 'anthropic.claude-3-haiku-20240307-v1:0',
                contentType: 'application/json',
                accept: 'application/json',
                body: JSON.stringify({
                    anthropic_version: 'bedrock-2023-05-31',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }]
                })
            });

            const response = await client.send(command);
            const body = JSON.parse(new TextDecoder().decode(response.body));
            const text = body.content?.[0]?.text || '';

            return this._parseAIResponse(text);
        } catch (err) {
            console.error('[NLQ] Bedrock error:', err.message);
            // Fallback to heuristic
            return this._heuristicGenerate(question.toLowerCase(), {}, [], dbType);
        }
    }

    /**
     * OpenAI-compatible API integration
     * @private
     */
    async _callOpenAI(question, schemaContext, dbType) {
        try {
            const apiKey = config.nlq?.apiKey;
            const baseUrl = config.nlq?.baseUrl || 'https://api.openai.com/v1';
            const model = config.nlq?.model || 'gpt-4o-mini';

            const prompt = this._buildPrompt(question, schemaContext, dbType);

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: 'You are a SQL expert. Generate only valid SQL. Respond in JSON format: {"sql": "...", "explanation": "...", "chartType": "table|bar|line|pie|number"}' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.1
                })
            });

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || '';
            return this._parseAIResponse(text);
        } catch (err) {
            console.error('[NLQ] OpenAI error:', err.message);
            return this._heuristicGenerate(question.toLowerCase(), {}, [], dbType);
        }
    }

    /**
     * Build the prompt for LLM
     * @private
     */
    _buildPrompt(question, schemaContext, dbType) {
        return `You are a Text-to-SQL assistant for a ${dbType} database.

DATABASE SCHEMA:
${schemaContext}

USER QUESTION: "${question}"

Generate a SQL query that answers this question. Respond ONLY in this JSON format:
{"sql": "SELECT ...", "explanation": "Brief explanation in the same language as the question", "chartType": "table|bar|line|pie|number"}

Rules:
- Use only tables and columns from the schema above
- For aggregation questions, suggest appropriate chart type
- If the question asks for a single number, use chartType "number"
- If time-series data, use "line"
- If comparing categories, use "bar" or "pie"
- Always LIMIT results to 1000 max
- Respond in the same language as the question`;
    }

    /**
     * Parse AI response (JSON extraction)
     * @private
     */
    _parseAIResponse(text) {
        try {
            // Try direct JSON parse
            const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(clean);
            return {
                sql: parsed.sql || '',
                explanation: parsed.explanation || '',
                chartType: parsed.chartType || 'table'
            };
        } catch (e) {
            // Extract SQL from text
            const sqlMatch = text.match(/SELECT[\s\S]*?(?:;|$)/i);
            return {
                sql: sqlMatch ? sqlMatch[0].replace(/;$/, '') : '',
                explanation: text.substring(0, 200),
                chartType: 'table'
            };
        }
    }

    /**
     * Built-in heuristic SQL generator (no LLM needed).
     * Handles common business questions using pattern matching + schema awareness.
     * @private
     */
    _heuristicGenerate(q, schema, tables, dbType) {
        const result = { sql: '', explanation: '', chartType: 'table' };

        // Detect language (BM vs EN)
        const isMalay = /berapa|jumlah|senarai|tunjuk|cari|semua|bulan|tahun|hari|siapa|ramai|mengikut/i.test(q);

        // ── Step 1: Find the most relevant table(s) from the question ──
        const targetTable = this._findBestTable(q, tables, schema);
        
        // Get columns for target table
        const cols = schema.tables?.[targetTable]?.columns || [];
        const colNames = cols.map(c => c.name || c);

        // ── Step 2: Detect WHERE conditions ──
        const whereClause = this._detectWhereConditions(q, colNames, cols);

        // ── Step 3: Detect query intent ──
        
        // Pattern: Count / Jumlah / Berapa ramai
        if (/berapa.*ramai|berapa.*jumlah.*rekod|count|how many|total\s*(rekod|record|row)/i.test(q)) {
            result.sql = `SELECT COUNT(*) AS total FROM ${targetTable}${whereClause}`;
            result.explanation = isMalay ? `Mengira jumlah rekod dalam jadual ${targetTable}` : `Counting total records in ${targetTable}`;
            result.chartType = 'number';
        }
        // Pattern: Sum / Total amount / Jumlah nilai
        else if (/jumlah.*nilai|total.*amount|sum|keseluruhan.*nilai|berapa.*jumlah.*(jualan|sales|amount|revenue|bayar|payment)/i.test(q)) {
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|sales|nilai|jumlah|bayar|fee|commission/i) || 'amount';
            result.sql = `SELECT SUM(${amountCol}) AS total FROM ${targetTable}${whereClause}`;
            result.explanation = isMalay ? `Jumlah keseluruhan ${amountCol} dari ${targetTable}` : `Total sum of ${amountCol} from ${targetTable}`;
            result.chartType = 'number';
        }
        // Pattern: Monthly / Bulanan
        else if (/bulan|month|monthly|bulanan|mengikut.*bulan|per.*month/i.test(q)) {
            const dateCol = this._findColumn(colNames, /date|created|time|tarikh|bulan|updated/i) || 'created_at';
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|sales|nilai/i);
            const valueExpr = amountCol ? `SUM(${amountCol})` : 'COUNT(*)';

            if (dbType === 'mysql') {
                result.sql = `SELECT DATE_FORMAT(${dateCol}, '%Y-%m') AS bulan, ${valueExpr} AS jumlah FROM ${targetTable}${whereClause} GROUP BY bulan ORDER BY bulan DESC LIMIT 12`;
            } else {
                result.sql = `SELECT TO_CHAR(${dateCol}, 'YYYY-MM') AS bulan, ${valueExpr} AS jumlah FROM ${targetTable}${whereClause} GROUP BY bulan ORDER BY bulan DESC LIMIT 12`;
            }
            result.explanation = isMalay ? `Data mengikut bulan dari ${targetTable}` : `Monthly breakdown from ${targetTable}`;
            result.chartType = 'bar';
        }
        // Pattern: Top / Teratas
        else if (/top|teratas|tertinggi|highest|best|paling.*tinggi|paling.*banyak/i.test(q)) {
            const limitMatch = q.match(/\d+/);
            const limit = limitMatch ? parseInt(limitMatch[0]) : 10;
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|count|sales|balance|fee/i) || colNames[colNames.length - 1] || 'id';
            const nameCol = this._findColumn(colNames, /name|nama|title|label|username|email|phone/i) || colNames[0] || 'id';
            result.sql = `SELECT ${nameCol}, ${amountCol} FROM ${targetTable}${whereClause} ORDER BY ${amountCol} DESC LIMIT ${limit}`;
            result.explanation = isMalay ? `${limit} teratas mengikut ${amountCol} dari ${targetTable}` : `Top ${limit} by ${amountCol} from ${targetTable}`;
            result.chartType = 'bar';
        }
        // Pattern: Who / Siapa
        else if (/siapa|who|which.*user|which.*admin/i.test(q)) {
            const nameCol = this._findColumn(colNames, /name|nama|username|email|first.*name|full.*name/i) || colNames[0] || '*';
            const typeCol = this._findColumn(colNames, /role|type|status|jenis|level/i);
            let filter = whereClause;
            if (!filter && typeCol) {
                // Try to extract filter value from question
                const roleMatch = q.match(/admin|editor|viewer|merchant|user|seller|buyer|agent/i);
                if (roleMatch) {
                    filter = ` WHERE ${typeCol} = '${roleMatch[0]}'`;
                }
            }
            result.sql = `SELECT * FROM ${targetTable}${filter} LIMIT 25`;
            result.explanation = isMalay ? `Senarai dari ${targetTable}${filter ? ' (ditapis)' : ''}` : `Listing from ${targetTable}${filter ? ' (filtered)' : ''}`;
            result.chartType = 'table';
        }
        // Pattern: List / Senarai
        else if (/senarai|list|show all|tunjuk.*semua|papar/i.test(q)) {
            result.sql = `SELECT * FROM ${targetTable}${whereClause} LIMIT 50`;
            result.explanation = isMalay ? `Senarai data dari ${targetTable}` : `Listing data from ${targetTable}`;
            result.chartType = 'table';
        }
        // Pattern: Recent / Terkini
        else if (/recent|terkini|latest|baru|last|terbaru/i.test(q)) {
            const dateCol = this._findColumn(colNames, /date|created|time|updated|registered/i) || 'created_at';
            const limitMatch = q.match(/\d+/);
            const limit = limitMatch ? parseInt(limitMatch[0]) : 20;
            result.sql = `SELECT * FROM ${targetTable}${whereClause} ORDER BY ${dateCol} DESC LIMIT ${limit}`;
            result.explanation = isMalay ? `${limit} rekod terkini dari ${targetTable}` : `${limit} recent records from ${targetTable}`;
            result.chartType = 'table';
        }
        // Pattern: Average / Purata
        else if (/average|purata|avg|mean/i.test(q)) {
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|age|duration|fee/i) || colNames[1] || 'id';
            result.sql = `SELECT ROUND(AVG(${amountCol}), 2) AS purata FROM ${targetTable}${whereClause}`;
            result.explanation = isMalay ? `Purata ${amountCol} dari ${targetTable}` : `Average ${amountCol} from ${targetTable}`;
            result.chartType = 'number';
        }
        // Pattern: Group by / Status / Category
        else if (/group|kumpul|mengikut.*status|mengikut.*jenis|by.*status|by.*type|pecahan|breakdown/i.test(q)) {
            const groupCol = this._findColumn(colNames, /status|type|category|jenis|kumpulan|group|role|level/i) || colNames[1] || 'status';
            result.sql = `SELECT ${groupCol}, COUNT(*) AS jumlah FROM ${targetTable}${whereClause} GROUP BY ${groupCol} ORDER BY jumlah DESC`;
            result.explanation = isMalay ? `Pengumpulan mengikut ${groupCol} dari ${targetTable}` : `Grouped by ${groupCol} from ${targetTable}`;
            result.chartType = 'pie';
        }
        // Pattern: "berapa" without specific pattern → count
        else if (/^berapa/i.test(q)) {
            result.sql = `SELECT COUNT(*) AS total FROM ${targetTable}${whereClause}`;
            result.explanation = isMalay ? `Jumlah rekod dalam ${targetTable}` : `Count from ${targetTable}`;
            result.chartType = 'number';
        }
        // Default: Show sample data
        else {
            result.sql = `SELECT * FROM ${targetTable}${whereClause} LIMIT 25`;
            result.explanation = isMalay ? `Paparan data dari ${targetTable}` : `Sample data from ${targetTable}`;
            result.chartType = 'table';
        }

        return result;
    }

    /**
     * Find the best matching table from user's question.
     * Uses fuzzy matching against table names.
     * @private
     */
    _findBestTable(q, tables, schema) {
        if (!tables.length) return 'data';
        
        const qLower = q.toLowerCase();
        
        // Direct table name match (exact or partial)
        for (const t of tables) {
            const tLower = t.toLowerCase();
            const tReadable = t.replace(/_/g, ' ').toLowerCase();
            const tSingular = tLower.replace(/s$/, ''); // users → user
            
            if (qLower.includes(tLower) || qLower.includes(tReadable) || qLower.includes(tSingular)) {
                return t;
            }
        }

        // Keyword-to-table mapping (common business terms)
        const keywordMap = {
            'user|pengguna|pelanggan|customer|member|ahli|ramai': /user|member|customer|pelanggan|account/i,
            'merchant|peniaga|seller|penjual|vendor|kedai|shop': /merchant|vendor|seller|shop|store/i,
            'transaction|transaksi|bayar|payment|jualan|sale|order|pesanan': /transaction|payment|order|sale|invoice|billing/i,
            'product|produk|item|barang': /product|item|catalog|inventory/i,
            'deposit|topup|tambah|wallet|baki|balance': /deposit|wallet|balance|topup|fund/i,
            'log|aktiviti|activity|history|sejarah': /log|activity|history|audit/i,
            'bank|akaun|account': /bank|account/i,
            'setting|tetapan|config': /setting|config|preference/i,
            'country|negara|currency|mata.*wang': /country|currency|region/i,
        };

        for (const [keywords, tablePattern] of Object.entries(keywordMap)) {
            const keyRegex = new RegExp(keywords, 'i');
            if (keyRegex.test(qLower)) {
                const match = tables.find(t => tablePattern.test(t));
                if (match) return match;
            }
        }

        // If nothing matches, return first table
        return tables[0];
    }

    /**
     * Find a column matching a pattern.
     * @private
     */
    _findColumn(colNames, pattern) {
        return colNames.find(c => pattern.test(c)) || null;
    }

    /**
     * Detect WHERE conditions from natural language.
     * @private
     */
    _detectWhereConditions(q, colNames, cols) {
        const conditions = [];
        const qLower = q.toLowerCase();

        // Detect status/type filters: "yang aktif", "status active", etc.
        const statusCol = colNames.find(c => /status|state|active/i.test(c));
        if (statusCol) {
            if (/aktif|active|enabled/i.test(qLower)) conditions.push(`${statusCol} = 'active'`);
            else if (/tidak.*aktif|inactive|disabled|deactivat/i.test(qLower)) conditions.push(`${statusCol} = 'inactive'`);
            else if (/pending|menunggu/i.test(qLower)) conditions.push(`${statusCol} = 'pending'`);
            else if (/approved|lulus|berjaya|success/i.test(qLower)) conditions.push(`${statusCol} = 'approved'`);
            else if (/rejected|gagal|fail/i.test(qLower)) conditions.push(`${statusCol} = 'rejected'`);
        }

        // Detect time filters: "hari ini", "bulan lepas", "minggu ini"
        const dateCol = colNames.find(c => /date|created|time|updated/i.test(c));
        if (dateCol) {
            if (/hari\s*ini|today/i.test(qLower)) conditions.push(`DATE(${dateCol}) = CURDATE()`);
            else if (/semalam|yesterday/i.test(qLower)) conditions.push(`DATE(${dateCol}) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`);
            else if (/minggu\s*ini|this\s*week/i.test(qLower)) conditions.push(`${dateCol} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`);
            else if (/bulan\s*ini|this\s*month/i.test(qLower)) conditions.push(`${dateCol} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`);
            else if (/bulan\s*lepas|last\s*month/i.test(qLower)) conditions.push(`${dateCol} >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH) AND ${dateCol} < DATE_FORMAT(CURDATE(), '%Y-%m-01')`);
        }

        // Detect role/type filter
        const typeCol = colNames.find(c => /type|role|jenis|level/i.test(c));
        if (typeCol) {
            const roleMatch = qLower.match(/\b(admin|editor|viewer|merchant|agent|seller|buyer|user)\b/i);
            if (roleMatch) conditions.push(`${typeCol} = '${roleMatch[1]}'`);
        }

        if (conditions.length === 0) return '';
        return ' WHERE ' + conditions.join(' AND ');
    }

    /**
     * Build schema context string for prompt construction.
     * @private
     */
    _buildSchemaContext(schema) {
        if (!schema || !schema.tables) return 'No schema available';

        let ctx = '';
        for (const [tableName, tableInfo] of Object.entries(schema.tables)) {
            const cols = (tableInfo.columns || []).map(c => {
                const name = c.name || c;
                const type = c.type || '';
                const key = c.key ? ` [${c.key}]` : '';
                return `  - ${name} ${type}${key}`;
            }).join('\n');
            ctx += `TABLE: ${tableName}\n${cols}\n\n`;
        }
        return ctx;
    }
}

// Decrypt helper (same as other routes)
function decrypt(text) {
    const key = crypto.scryptSync(config.encryptionKey, 'salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Full NLQ pipeline: question → schema → SQL → execute → results
 */
async function processQuestion(userId, connectionId, question) {
    // 1. Get connection info
    const connResult = await db.query(
        'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
        [connectionId, userId]
    );
    if (!connResult.rows.length) {
        throw new Error('Connection not found');
    }

    const conn = connResult.rows[0];
    let password = '';
    try {
        password = conn.password_encrypted ? decrypt(conn.password_encrypted) : '';
    } catch (e) {
        throw new Error('Failed to decrypt connection credentials');
    }

    const options = conn.options || {};

    // 2. Get schema for context
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
        throw new Error('Failed to get database schema: ' + err.message);
    }

    // 3. Generate SQL from natural language
    const engine = new NLQEngine();
    const generated = await engine.generateSQL({
        question,
        schema,
        dbType: conn.db_type,
        userId
    });

    if (!generated.sql) {
        cleanup();
        throw new Error('Could not generate SQL from your question. Try rephrasing.');
    }

    // 4. Execute the generated SQL
    let results;
    try {
        results = await adapter.query(generated.sql);
    } catch (queryErr) {
        cleanup();
        return {
            success: false,
            question,
            sql: generated.sql,
            explanation: generated.explanation,
            chartType: generated.chartType,
            error: queryErr.message,
            data: null
        };
    }

    cleanup();

    // 5. Return structured response
    return {
        success: true,
        question,
        sql: generated.sql,
        explanation: generated.explanation,
        chartType: generated.chartType,
        columns: results.columns,
        data: results.data,
        rowCount: results.data?.length || 0,
        duration: results.duration
    };
}

module.exports = { NLQEngine, processQuestion };
