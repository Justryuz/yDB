/**
 * @file services/nlq.js
 * @description Natural Language Query (NLQ) / Text-to-SQL engine.
 *
 * This is the core AI layer for the BI Copilot feature.
 * Converts natural language business questions into executable SQL queries
 * with schema awareness, intelligent table detection, JOIN inference,
 * and automatic visualization recommendations.
 *
 * Supports:
 *  - Pluggable LLM backends (Amazon Bedrock, OpenAI, built-in heuristic)
 *  - Multi-language input (English, Bahasa Malaysia)
 *  - Cross-table JOIN detection
 *  - Time-based filters (today, this week, last month, YTD, etc.)
 *  - Status/role/category filtering
 *  - Aggregation (COUNT, SUM, AVG, MIN, MAX)
 *  - Grouping with automatic chart type selection
 *  - Top-N / Bottom-N queries
 *  - Trend analysis (time-series)
 */

const crypto = require('crypto');
const config = require('../config');
const db = require('../db/pool');
const poolManager = require('./pool-manager');
const { withTunnel } = require('./ssh-tunnel');

// ═══════════════════════════════════════════════════════════════════════
// KEYWORD-TO-TABLE MAPPING
// Maps business domain terms to likely table name patterns.
// The engine scans the actual schema tables and matches against these.
// ═══════════════════════════════════════════════════════════════════════

const TABLE_KEYWORD_MAP = {
    // People / Accounts
    'user|pengguna|pelanggan|customer|client|member|ahli|subscriber|account|akaun|registration|signup':
        /user|member|customer|client|account|pelanggan|subscriber|registration/i,

    // Merchants / Business
    'merchant|peniaga|seller|penjual|vendor|kedai|shop|store|business|supplier|partner':
        /merchant|vendor|seller|shop|store|business|supplier|partner/i,

    // Transactions / Payments
    'transaction|transaksi|bayar|payment|jualan|sale|order|pesanan|purchase|checkout|billing|invoice|receipt':
        /transaction|payment|order|sale|purchase|invoice|billing|checkout|receipt/i,

    // Products / Inventory
    'product|produk|item|barang|catalog|inventory|stock|sku|goods|merchandise':
        /product|item|catalog|inventory|stock|sku|goods|merchandise/i,

    // Finance / Money
    'deposit|topup|tambah|wallet|baki|balance|fund|credit|debit|payout|withdrawal|cashout|refund':
        /deposit|wallet|balance|topup|fund|credit|payout|withdrawal|cashout|refund/i,

    // Logs / Activity
    'log|aktiviti|activity|history|sejarah|audit|event|tracking|session':
        /log|activity|history|audit|event|tracking|session/i,

    // Banking
    'bank|akaun.*bank|bank.*account|settlement|transfer|remittance':
        /bank|settlement|transfer|remittance/i,

    // Configuration
    'setting|tetapan|config|preference|option|parameter':
        /setting|config|preference|option|parameter/i,

    // Geography
    'country|negara|state|negeri|city|bandar|region|area|zone|district|location|address':
        /country|state|city|region|area|zone|district|location|address/i,

    // Currency / Exchange
    'currency|mata.*wang|exchange|rate|kadar':
        /currency|exchange|rate/i,

    // Messaging / Communication
    'message|mesej|notification|alert|email|sms|chat|inbox|outbox':
        /message|notification|alert|email|sms|chat|inbox|outbox/i,

    // Support / Tickets
    'ticket|tiket|support|complaint|aduan|dispute|issue|case|enquiry|feedback':
        /ticket|support|complaint|dispute|issue|case|enquiry|feedback/i,

    // Promotions / Marketing
    'promo|promotion|coupon|voucher|discount|campaign|offer|deal|reward|loyalty|point':
        /promo|coupon|voucher|discount|campaign|offer|deal|reward|loyalty|point/i,

    // Documents / Files
    'document|dokumen|file|attachment|upload|media|image|photo|document':
        /document|file|attachment|upload|media|image|photo/i,

    // KYC / Verification
    'kyc|verification|verify|identity|ic|passport|selfie|document.*verify':
        /kyc|verification|verify|identity|document/i,

    // Commission / Fees
    'commission|komisen|fee|charge|caj|markup|margin|earning':
        /commission|fee|charge|markup|margin|earning/i,

    // Reports / Analytics
    'report|laporan|summary|ringkasan|dashboard|analytics|statistic|stat':
        /report|summary|dashboard|analytics|statistic/i,

    // Subscription / Plans
    'subscription|langganan|plan|package|tier|membership|license':
        /subscription|plan|package|tier|membership|license/i,

    // Crypto / Digital Assets
    'crypto|token|coin|blockchain|nft|digital.*asset':
        /crypto|token|coin|blockchain|nft|digital.*asset/i,

    // Devices / Hardware
    'device|peranti|terminal|pos|hardware|machine':
        /device|terminal|pos|hardware|machine/i,

    // Backup / Archives
    'backup|arkib|archive|snapshot':
        /backup|archive|snapshot/i,

    // Roles / Permissions
    'role|peranan|permission|kebenaran|privilege|access':
        /role|permission|privilege|access/i,

    // Addons / Plugins / Extensions
    'addon|plugin|extension|module|integration|api.*key':
        /addon|plugin|extension|module|integration|api.*key/i,
};

// ═══════════════════════════════════════════════════════════════════════
// AGGREGATION KEYWORDS
// ═══════════════════════════════════════════════════════════════════════

const AGG_PATTERNS = {
    count: /how many|berapa.*ramai|berapa.*banyak|count|total.*number|jumlah.*rekod|number of/i,
    sum: /total.*amount|sum|jumlah.*nilai|total.*value|total.*sales|total.*revenue|gross|net.*total|berapa.*jumlah.*(bayar|jualan|deposit|amount|revenue)/i,
    avg: /average|purata|avg|mean|typical/i,
    max: /maximum|max|highest|tertinggi|paling.*tinggi|largest|biggest|most.*expensive/i,
    min: /minimum|min|lowest|terendah|paling.*rendah|smallest|cheapest|least/i,
};

// ═══════════════════════════════════════════════════════════════════════
// TIME FILTER PATTERNS
// ═══════════════════════════════════════════════════════════════════════

const TIME_PATTERNS = {
    today: /today|hari\s*ini|this day/i,
    yesterday: /yesterday|semalam|kelmarin/i,
    this_week: /this\s*week|minggu\s*ini|current week/i,
    last_week: /last\s*week|minggu\s*lepas|previous week/i,
    this_month: /this\s*month|bulan\s*ini|current month/i,
    last_month: /last\s*month|bulan\s*lepas|previous month/i,
    last_3_months: /last\s*3\s*months|3\s*bulan|quarter|suku\s*tahun/i,
    last_6_months: /last\s*6\s*months|6\s*bulan|half\s*year/i,
    this_year: /this\s*year|tahun\s*ini|ytd|year\s*to\s*date/i,
    last_year: /last\s*year|tahun\s*lepas|previous year/i,
    last_7_days: /last\s*7\s*days|past\s*week|7\s*hari/i,
    last_30_days: /last\s*30\s*days|past\s*month|30\s*hari/i,
    last_90_days: /last\s*90\s*days|past\s*quarter|90\s*hari/i,
};

// ═══════════════════════════════════════════════════════════════════════
// STATUS / STATE KEYWORDS
// ═══════════════════════════════════════════════════════════════════════

const STATUS_KEYWORDS = {
    active: /\b(active|aktif|enabled|live|online)\b/i,
    inactive: /\b(inactive|tidak.*aktif|disabled|offline|dormant|suspended)\b/i,
    pending: /\b(pending|menunggu|awaiting|in.*progress|processing|queued)\b/i,
    approved: /\b(approved|lulus|accepted|confirmed|verified|completed|success|successful|berjaya)\b/i,
    rejected: /\b(rejected|gagal|failed|denied|declined|cancelled|canceled|refused)\b/i,
    expired: /\b(expired|tamat|lapsed|overdue)\b/i,
    blocked: /\b(blocked|banned|blacklisted|frozen|locked)\b/i,
};

// ═══════════════════════════════════════════════════════════════════════
// NLQ ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════

class NLQEngine {
    constructor() {
        this.conversations = new Map();
    }

    /**
     * Process a natural language question and generate SQL.
     * @param {Object} opts
     * @param {string} opts.question - Natural language question
     * @param {Object} opts.schema - Database schema { tables: { name: { columns } } }
     * @param {string} opts.dbType - Database type (postgresql, mysql, etc.)
     * @param {number} opts.userId - User ID for conversation context
     * @returns {Promise<{ sql: string, explanation: string, chartType: string }>}
     */
    async generateSQL(opts) {
        const { question, schema, dbType, userId } = opts;
        const tables = Object.keys(schema.tables || {});
        const q = question.toLowerCase().trim();

        // Build schema context for LLM prompt
        const schemaContext = this._buildSchemaContext(schema);

        // Try external LLM first if configured
        if (config.nlq && config.nlq.provider !== 'builtin') {
            return await this._callExternalLLM(question, schemaContext, dbType);
        }

        // Built-in intelligent heuristic engine
        return this._heuristicGenerate(q, question, schema, tables, dbType);
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

        // Fallback
        return this._heuristicGenerate(question.toLowerCase(), question, {}, [], dbType);
    }

    /**
     * Amazon Bedrock integration (Claude)
     * @private
     */
    async _callBedrock(question, schemaContext, dbType) {
        try {
            const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
            const client = new BedrockRuntimeClient({ region: config.nlq?.region || 'us-east-1' });

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
            return this._parseAIResponse(body.content?.[0]?.text || '');
        } catch (err) {
            console.error('[NLQ] Bedrock error:', err.message);
            return this._heuristicGenerate(question.toLowerCase(), question, {}, [], 'mysql');
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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: 'You are a SQL expert. Generate valid SQL. Respond in JSON: {"sql":"...","explanation":"...","chartType":"table|bar|line|pie|number"}' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.1
                })
            });

            const data = await response.json();
            return this._parseAIResponse(data.choices?.[0]?.message?.content || '');
        } catch (err) {
            console.error('[NLQ] OpenAI error:', err.message);
            return this._heuristicGenerate(question.toLowerCase(), question, {}, [], 'mysql');
        }
    }

    /**
     * Build prompt for LLM
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
     * Parse AI response text to structured object
     * @private
     */
    _parseAIResponse(text) {
        try {
            const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(clean);
            return { sql: parsed.sql || '', explanation: parsed.explanation || '', chartType: parsed.chartType || 'table' };
        } catch (e) {
            const sqlMatch = text.match(/SELECT[\s\S]*?(?:;|$)/i);
            return { sql: sqlMatch ? sqlMatch[0].replace(/;$/, '') : '', explanation: text.substring(0, 200), chartType: 'table' };
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // BUILT-IN HEURISTIC ENGINE
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Intelligent heuristic SQL generator.
     * Handles business questions using advanced pattern matching + schema awareness.
     * @private
     */
    _heuristicGenerate(q, originalQuestion, schema, tables, dbType) {
        const result = { sql: '', explanation: '', chartType: 'table' };
        const isMalay = /berapa|jumlah|senarai|tunjuk|cari|semua|bulan|tahun|hari|siapa|ramai|mengikut|papar/i.test(q);
        const isMySQL = dbType === 'mysql' || dbType === 'mariadb';

        // Step 1: Identify target table
        const targetTable = this._findBestTable(q, tables, schema);
        const cols = schema.tables?.[targetTable]?.columns || [];
        const colNames = cols.map(c => c.name || c);

        // Step 2: Detect if JOIN is needed
        const joinInfo = this._detectJoin(q, tables, schema, targetTable);

        // Step 3: Build WHERE conditions
        const whereClause = this._buildWhereClause(q, colNames, cols, isMySQL);

        // Step 4: Determine query intent and generate SQL

        // ── COUNT queries ──
        if (AGG_PATTERNS.count.test(q)) {
            const fromClause = joinInfo ? `${targetTable} ${joinInfo.joinClause}` : targetTable;
            result.sql = `SELECT COUNT(*) AS total FROM ${fromClause}${whereClause}`;
            result.explanation = isMalay ? `Jumlah rekod dalam ${targetTable}` : `Total record count from ${targetTable}`;
            result.chartType = 'number';
        }
        // ── SUM queries ──
        else if (AGG_PATTERNS.sum.test(q)) {
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|sales|nilai|value|fee|commission|balance|sum|gross|net|cost/i) || 'amount';
            const fromClause = joinInfo ? `${targetTable} ${joinInfo.joinClause}` : targetTable;
            result.sql = `SELECT SUM(${targetTable}.${amountCol}) AS total FROM ${fromClause}${whereClause}`;
            result.explanation = isMalay ? `Jumlah ${amountCol} dari ${targetTable}` : `Sum of ${amountCol} from ${targetTable}`;
            result.chartType = 'number';
        }
        // ── AVERAGE queries ──
        else if (AGG_PATTERNS.avg.test(q)) {
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|age|duration|fee|value|rating|score/i) || colNames[1] || 'id';
            result.sql = `SELECT ROUND(AVG(${amountCol}), 2) AS average FROM ${targetTable}${whereClause}`;
            result.explanation = isMalay ? `Purata ${amountCol} dari ${targetTable}` : `Average ${amountCol} from ${targetTable}`;
            result.chartType = 'number';
        }
        // ── MAX queries ──
        else if (AGG_PATTERNS.max.test(q)) {
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|fee|value|balance|score|rating/i) || colNames[colNames.length - 1];
            result.sql = `SELECT MAX(${amountCol}) AS maximum FROM ${targetTable}${whereClause}`;
            result.explanation = isMalay ? `Nilai tertinggi ${amountCol} dari ${targetTable}` : `Maximum ${amountCol} from ${targetTable}`;
            result.chartType = 'number';
        }
        // ── MIN queries ──
        else if (AGG_PATTERNS.min.test(q)) {
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|fee|value|balance|score|rating/i) || colNames[colNames.length - 1];
            result.sql = `SELECT MIN(${amountCol}) AS minimum FROM ${targetTable}${whereClause}`;
            result.explanation = isMalay ? `Nilai terendah ${amountCol} dari ${targetTable}` : `Minimum ${amountCol} from ${targetTable}`;
            result.chartType = 'number';
        }
        // ── TREND / MONTHLY / TIME-SERIES ──
        else if (/trend|bulan|month|monthly|bulanan|daily|harian|weekly|mingguan|over\s*time|growth|per\s*(day|week|month|year)/i.test(q)) {
            const dateCol = this._findColumn(colNames, /date|created|time|tarikh|registered|joined|updated|occurred|timestamp/i) || 'created_at';
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|sales|nilai|value|fee|count/i);
            const valueExpr = amountCol ? `SUM(${amountCol})` : 'COUNT(*)';

            let groupFormat, groupAlias;
            if (/daily|harian|per\s*day/i.test(q)) {
                groupFormat = isMySQL ? `DATE(${dateCol})` : `DATE(${dateCol})`;
                groupAlias = 'day';
            } else if (/weekly|mingguan|per\s*week/i.test(q)) {
                groupFormat = isMySQL ? `DATE_FORMAT(${dateCol}, '%Y-W%u')` : `TO_CHAR(${dateCol}, 'IYYY-"W"IW')`;
                groupAlias = 'week';
            } else {
                groupFormat = isMySQL ? `DATE_FORMAT(${dateCol}, '%Y-%m')` : `TO_CHAR(${dateCol}, 'YYYY-MM')`;
                groupAlias = 'month';
            }

            result.sql = `SELECT ${groupFormat} AS ${groupAlias}, ${valueExpr} AS total FROM ${targetTable}${whereClause} GROUP BY ${groupAlias} ORDER BY ${groupAlias} DESC LIMIT 12`;
            result.explanation = isMalay ? `Trend mengikut ${groupAlias} dari ${targetTable}` : `${groupAlias.charAt(0).toUpperCase() + groupAlias.slice(1)}ly trend from ${targetTable}`;
            result.chartType = /daily|harian/i.test(q) ? 'line' : 'bar';
        }
        // ── TOP-N queries ──
        else if (/top|teratas|tertinggi|highest|best|paling.*tinggi|paling.*banyak|most|leading|biggest/i.test(q)) {
            const limitMatch = q.match(/\d+/);
            const limit = limitMatch ? Math.min(parseInt(limitMatch[0]), 100) : 10;
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|count|sales|balance|fee|value|score|rating|commission/i) || colNames[colNames.length - 1] || 'id';
            const nameCol = this._findColumn(colNames, /name|nama|title|label|username|email|phone|description|company/i) || colNames[0] || 'id';

            const fromClause = joinInfo ? `${targetTable} ${joinInfo.joinClause}` : targetTable;
            const selectCols = joinInfo ? `${targetTable}.${nameCol}, ${targetTable}.${amountCol}` : `${nameCol}, ${amountCol}`;
            result.sql = `SELECT ${selectCols} FROM ${fromClause}${whereClause} ORDER BY ${targetTable}.${amountCol} DESC LIMIT ${limit}`;
            result.explanation = isMalay ? `Top ${limit} mengikut ${amountCol} dari ${targetTable}` : `Top ${limit} by ${amountCol} from ${targetTable}`;
            result.chartType = 'bar';
        }
        // ── BOTTOM-N queries ──
        else if (/bottom|lowest|terendah|worst|least|fewest/i.test(q)) {
            const limitMatch = q.match(/\d+/);
            const limit = limitMatch ? Math.min(parseInt(limitMatch[0]), 100) : 10;
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|count|sales|balance|fee|value/i) || colNames[colNames.length - 1] || 'id';
            const nameCol = this._findColumn(colNames, /name|nama|title|label|username|email/i) || colNames[0] || 'id';
            result.sql = `SELECT ${nameCol}, ${amountCol} FROM ${targetTable}${whereClause} ORDER BY ${amountCol} ASC LIMIT ${limit}`;
            result.explanation = isMalay ? `${limit} terendah mengikut ${amountCol}` : `Bottom ${limit} by ${amountCol} from ${targetTable}`;
            result.chartType = 'bar';
        }
        // ── GROUP BY / BREAKDOWN / DISTRIBUTION ──
        else if (/group|kumpul|mengikut|breakdown|by\s*(status|type|category|role)|distribution|pecahan|segmen|segment|classify|ratio|proportion/i.test(q)) {
            const groupCol = this._detectGroupColumn(q, colNames) || this._findColumn(colNames, /status|type|category|jenis|role|level|tier|group|class|segment/i) || colNames[1] || 'status';
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|value|fee/i);
            const aggExpr = amountCol ? `SUM(${amountCol})` : 'COUNT(*)';
            result.sql = `SELECT ${groupCol}, ${aggExpr} AS total FROM ${targetTable}${whereClause} GROUP BY ${groupCol} ORDER BY total DESC LIMIT 20`;
            result.explanation = isMalay ? `Pecahan mengikut ${groupCol} dari ${targetTable}` : `Breakdown by ${groupCol} from ${targetTable}`;
            result.chartType = 'pie';
        }
        // ── WHO / SIAPA queries ──
        else if (/who|siapa|which\s*(user|merchant|customer|admin|person)/i.test(q)) {
            const typeCol = this._findColumn(colNames, /role|type|status|jenis|level|position|title/i);
            let filter = whereClause;
            if (!filter && typeCol) {
                const roleMatch = q.match(/\b(admin|editor|viewer|merchant|agent|seller|buyer|user|manager|staff|operator|superadmin)\b/i);
                if (roleMatch) filter = ` WHERE ${typeCol} = '${roleMatch[1]}'`;
            }
            result.sql = `SELECT * FROM ${targetTable}${filter} ORDER BY id DESC LIMIT 25`;
            result.explanation = isMalay ? `Senarai dari ${targetTable}${filter ? ' (ditapis)' : ''}` : `Records from ${targetTable}${filter ? ' (filtered)' : ''}`;
            result.chartType = 'table';
        }
        // ── RECENT / LATEST queries ──
        else if (/recent|terkini|latest|newest|baru|last|terbaru|just\s*now|newly/i.test(q)) {
            const dateCol = this._findColumn(colNames, /date|created|time|updated|registered|joined|occurred|timestamp/i) || 'created_at';
            const limitMatch = q.match(/\d+/);
            const limit = limitMatch ? Math.min(parseInt(limitMatch[0]), 100) : 20;
            result.sql = `SELECT * FROM ${targetTable}${whereClause} ORDER BY ${dateCol} DESC LIMIT ${limit}`;
            result.explanation = isMalay ? `${limit} rekod terkini dari ${targetTable}` : `${limit} most recent records from ${targetTable}`;
            result.chartType = 'table';
        }
        // ── SEARCH / FIND specific value ──
        else if (/find|cari|search|look.*for|where.*is|locate/i.test(q)) {
            const searchTerm = q.replace(/find|cari|search|look\s*for|where\s*is|locate/gi, '').trim();
            const searchCol = this._findColumn(colNames, /name|nama|title|email|phone|username|description|label/i) || colNames[0];
            result.sql = `SELECT * FROM ${targetTable} WHERE ${searchCol} LIKE '%${searchTerm.replace(/'/g, "''")}%' LIMIT 25`;
            result.explanation = isMalay ? `Carian "${searchTerm}" dalam ${targetTable}` : `Search "${searchTerm}" in ${targetTable}`;
            result.chartType = 'table';
        }
        // ── LIST / SHOW queries ──
        else if (/senarai|list|show|tunjuk|papar|display|all|semua|view/i.test(q)) {
            const limitMatch = q.match(/\d+/);
            const limit = limitMatch ? Math.min(parseInt(limitMatch[0]), 100) : 50;
            result.sql = `SELECT * FROM ${targetTable}${whereClause} LIMIT ${limit}`;
            result.explanation = isMalay ? `Senarai data dari ${targetTable}` : `Listing records from ${targetTable}`;
            result.chartType = 'table';
        }
        // ── COMPARE / VERSUS ──
        else if (/compare|banding|versus|vs|difference|between/i.test(q)) {
            const groupCol = this._findColumn(colNames, /status|type|category|role|level|tier|group/i) || colNames[1];
            const amountCol = this._findColumn(colNames, /amount|total|price|revenue|value|count/i);
            const aggExpr = amountCol ? `SUM(${amountCol})` : 'COUNT(*)';
            result.sql = `SELECT ${groupCol}, ${aggExpr} AS total, COUNT(*) AS count FROM ${targetTable}${whereClause} GROUP BY ${groupCol} ORDER BY total DESC`;
            result.explanation = isMalay ? `Perbandingan mengikut ${groupCol}` : `Comparison by ${groupCol} from ${targetTable}`;
            result.chartType = 'bar';
        }
        // ── GENERIC "berapa" (how much/many) ──
        else if (/^berapa|how\s*much|how\s*many/i.test(q)) {
            result.sql = `SELECT COUNT(*) AS total FROM ${targetTable}${whereClause}`;
            result.explanation = isMalay ? `Jumlah rekod dalam ${targetTable}` : `Count from ${targetTable}`;
            result.chartType = 'number';
        }
        // ── DEFAULT: show sample data ──
        else {
            result.sql = `SELECT * FROM ${targetTable}${whereClause} ORDER BY 1 DESC LIMIT 25`;
            result.explanation = isMalay ? `Data dari ${targetTable}` : `Data from ${targetTable}`;
            result.chartType = 'table';
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Find the best matching table from user's question.
     * Uses keyword mapping + fuzzy matching against actual schema tables.
     * @private
     */
    _findBestTable(q, tables, schema) {
        if (!tables.length) return 'data';
        const qLower = q.toLowerCase();

        // 1. Direct exact/partial table name match
        for (const t of tables) {
            const tLower = t.toLowerCase();
            const tReadable = t.replace(/_/g, ' ').toLowerCase();
            const tSingular = tLower.replace(/s$/, '');
            const tPlural = tLower + 's';

            if (qLower.includes(tLower) || qLower.includes(tReadable) ||
                qLower.includes(tSingular) || qLower.includes(tPlural)) {
                return t;
            }
        }

        // 2. Keyword-to-table pattern matching
        for (const [keywords, tablePattern] of Object.entries(TABLE_KEYWORD_MAP)) {
            const keyRegex = new RegExp(`\\b(${keywords})\\b`, 'i');
            if (keyRegex.test(qLower)) {
                const match = tables.find(t => tablePattern.test(t));
                if (match) return match;
            }
        }

        // 3. Partial substring match (last resort)
        const words = qLower.split(/\s+/).filter(w => w.length > 3);
        for (const word of words) {
            const match = tables.find(t => t.toLowerCase().includes(word) || word.includes(t.toLowerCase().replace(/s$/, '')));
            if (match) return match;
        }

        // 4. Default to first table
        return tables[0];
    }

    /**
     * Detect if a JOIN is needed between tables.
     * Looks for FK relationships (user_id, merchant_id, etc.)
     * @private
     */
    _detectJoin(q, tables, schema, primaryTable) {
        const qLower = q.toLowerCase();

        // Check if question mentions another table
        for (const t of tables) {
            if (t === primaryTable) continue;
            const tSingular = t.replace(/s$/, '').toLowerCase();

            if (qLower.includes(t.toLowerCase()) || qLower.includes(tSingular)) {
                // Find FK relationship
                const primaryCols = (schema.tables?.[primaryTable]?.columns || []).map(c => c.name || c);
                const fkCol = primaryCols.find(c => c.toLowerCase().includes(tSingular + '_id') || c.toLowerCase() === tSingular + '_id');

                if (fkCol) {
                    return {
                        joinTable: t,
                        joinClause: `LEFT JOIN ${t} ON ${primaryTable}.${fkCol} = ${t}.id`
                    };
                }

                // Check reverse FK
                const secondaryCols = (schema.tables?.[t]?.columns || []).map(c => c.name || c);
                const reverseFk = secondaryCols.find(c => c.toLowerCase().includes(primaryTable.replace(/s$/, '') + '_id'));
                if (reverseFk) {
                    return {
                        joinTable: t,
                        joinClause: `LEFT JOIN ${t} ON ${primaryTable}.id = ${t}.${reverseFk}`
                    };
                }
            }
        }

        return null;
    }

    /**
     * Build WHERE clause from natural language conditions.
     * Detects time filters, status filters, and value conditions.
     * @private
     */
    _buildWhereClause(q, colNames, cols, isMySQL) {
        const conditions = [];

        // Time filters
        const dateCol = this._findColumn(colNames, /date|created|time|updated|registered|joined|occurred|timestamp/i);
        if (dateCol) {
            for (const [period, pattern] of Object.entries(TIME_PATTERNS)) {
                if (pattern.test(q)) {
                    conditions.push(this._getTimeCondition(dateCol, period, isMySQL));
                    break;
                }
            }
        }

        // Status filters
        const statusCol = this._findColumn(colNames, /status|state|active|is_active|enabled/i);
        if (statusCol) {
            for (const [status, pattern] of Object.entries(STATUS_KEYWORDS)) {
                if (pattern.test(q)) {
                    if (statusCol.includes('is_') || statusCol.includes('active')) {
                        // Boolean column
                        conditions.push(`${statusCol} = ${status === 'active' ? '1' : '0'}`);
                    } else {
                        conditions.push(`${statusCol} = '${status}'`);
                    }
                    break;
                }
            }
        }

        // Role/type filter
        const typeCol = this._findColumn(colNames, /type|role|jenis|level|position|tier|category/i);
        if (typeCol && typeCol !== statusCol) {
            const roleMatch = q.match(/\b(admin|editor|viewer|merchant|agent|seller|buyer|user|manager|staff|operator|superadmin|premium|free|basic|pro|enterprise)\b/i);
            if (roleMatch) conditions.push(`${typeCol} = '${roleMatch[1]}'`);
        }

        if (conditions.length === 0) return '';
        return ' WHERE ' + conditions.join(' AND ');
    }

    /**
     * Generate SQL time condition for a given period.
     * @private
     */
    _getTimeCondition(dateCol, period, isMySQL) {
        if (isMySQL) {
            switch (period) {
                case 'today': return `DATE(${dateCol}) = CURDATE()`;
                case 'yesterday': return `DATE(${dateCol}) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
                case 'this_week': return `${dateCol} >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`;
                case 'last_week': return `${dateCol} >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7) DAY) AND ${dateCol} < DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`;
                case 'this_month': return `${dateCol} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
                case 'last_month': return `${dateCol} >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND ${dateCol} < DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
                case 'last_3_months': return `${dateCol} >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)`;
                case 'last_6_months': return `${dateCol} >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)`;
                case 'this_year': return `YEAR(${dateCol}) = YEAR(CURDATE())`;
                case 'last_year': return `YEAR(${dateCol}) = YEAR(CURDATE()) - 1`;
                case 'last_7_days': return `${dateCol} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
                case 'last_30_days': return `${dateCol} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
                case 'last_90_days': return `${dateCol} >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`;
                default: return `${dateCol} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
            }
        } else {
            // PostgreSQL syntax
            switch (period) {
                case 'today': return `DATE(${dateCol}) = CURRENT_DATE`;
                case 'yesterday': return `DATE(${dateCol}) = CURRENT_DATE - 1`;
                case 'this_week': return `${dateCol} >= DATE_TRUNC('week', CURRENT_DATE)`;
                case 'last_week': return `${dateCol} >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND ${dateCol} < DATE_TRUNC('week', CURRENT_DATE)`;
                case 'this_month': return `${dateCol} >= DATE_TRUNC('month', CURRENT_DATE)`;
                case 'last_month': return `${dateCol} >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND ${dateCol} < DATE_TRUNC('month', CURRENT_DATE)`;
                case 'last_3_months': return `${dateCol} >= CURRENT_DATE - INTERVAL '3 months'`;
                case 'last_6_months': return `${dateCol} >= CURRENT_DATE - INTERVAL '6 months'`;
                case 'this_year': return `EXTRACT(YEAR FROM ${dateCol}) = EXTRACT(YEAR FROM CURRENT_DATE)`;
                case 'last_year': return `EXTRACT(YEAR FROM ${dateCol}) = EXTRACT(YEAR FROM CURRENT_DATE) - 1`;
                case 'last_7_days': return `${dateCol} >= CURRENT_DATE - INTERVAL '7 days'`;
                case 'last_30_days': return `${dateCol} >= CURRENT_DATE - INTERVAL '30 days'`;
                case 'last_90_days': return `${dateCol} >= CURRENT_DATE - INTERVAL '90 days'`;
                default: return `${dateCol} >= CURRENT_DATE - INTERVAL '30 days'`;
            }
        }
    }

    /**
     * Detect which column to GROUP BY based on question context.
     * @private
     */
    _detectGroupColumn(q, colNames) {
        // Look for "by X" or "mengikut X" pattern
        const byMatch = q.match(/(?:by|mengikut|ikut|per)\s+(\w+)/i);
        if (byMatch) {
            const wanted = byMatch[1].toLowerCase();
            const match = colNames.find(c => c.toLowerCase().includes(wanted));
            if (match) return match;
        }
        return null;
    }

    /**
     * Find a column matching a regex pattern.
     * @private
     */
    _findColumn(colNames, pattern) {
        return colNames.find(c => pattern.test(c)) || null;
    }

    /**
     * Build schema context string for LLM prompt.
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

// ═══════════════════════════════════════════════════════════════════════
// PIPELINE: Question → Schema → SQL → Execute → Results
// ═══════════════════════════════════════════════════════════════════════

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
    if (!connResult.rows.length) throw new Error('Connection not found');

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

    // 3. Generate SQL
    const engine = new NLQEngine();
    const generated = await engine.generateSQL({ question, schema, dbType: conn.db_type, userId });

    if (!generated.sql) {
        cleanup();
        throw new Error('Could not generate SQL from your question. Try rephrasing.');
    }

    // 4. Execute
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
