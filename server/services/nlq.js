/**
 * @file services/nlq.js
 * @description Natural Language Query (NLQ) / Text-to-SQL engine.
 *
 * Converts natural language business questions into executable SQL queries
 * with schema awareness, intelligent table detection, JOIN inference,
 * and automatic visualization recommendations.
 *
 * Supports:
 *  - Pluggable LLM backends (Amazon Bedrock, OpenAI, built-in heuristic)
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
// ═══════════════════════════════════════════════════════════════════════

const TABLE_KEYWORD_MAP = {
    'user|customer|client|member|subscriber|account|registration|signup|profile':
        /user|member|customer|client|account|subscriber|registration|profile/i,
    'merchant|seller|vendor|shop|store|business|supplier|partner|retailer|outlet':
        /merchant|vendor|seller|shop|store|business|supplier|partner|retailer|outlet/i,
    'transaction|payment|sale|order|purchase|checkout|billing|invoice|receipt':
        /transaction|payment|order|sale|purchase|invoice|billing|checkout|receipt/i,
    'product|item|catalog|inventory|stock|sku|goods|merchandise|listing':
        /product|item|catalog|inventory|stock|sku|goods|merchandise|listing/i,
    'deposit|topup|wallet|balance|fund|credit|debit|payout|withdrawal|cashout|refund':
        /deposit|wallet|balance|topup|fund|credit|payout|withdrawal|cashout|refund/i,
    'log|activity|history|audit|event|tracking|session':
        /log|activity|history|audit|event|tracking|session/i,
    'bank|settlement|transfer|remittance':
        /bank|settlement|transfer|remittance/i,
    'setting|config|preference|option|parameter':
        /setting|config|preference|option|parameter/i,
    'country|state|city|region|area|zone|district|location|address':
        /country|state|city|region|area|zone|district|location|address/i,
    'currency|exchange|rate|forex':
        /currency|exchange|rate|forex/i,
    'message|notification|alert|email|sms|chat|inbox':
        /message|notification|alert|email|sms|chat|inbox/i,
    'ticket|support|complaint|dispute|issue|case|enquiry|feedback|helpdesk':
        /ticket|support|complaint|dispute|issue|case|enquiry|feedback|helpdesk/i,
    'promo|promotion|coupon|voucher|discount|campaign|offer|deal|reward|loyalty|point|referral':
        /promo|coupon|voucher|discount|campaign|offer|deal|reward|loyalty|point|referral/i,
    'cashback|rebate':
        /cashback|rebate/i,
    'document|file|attachment|upload|media|image|photo':
        /document|file|attachment|upload|media|image|photo/i,
    'kyc|verification|verify|identity':
        /kyc|verification|verify|identity/i,
    'commission|fee|charge|markup|margin|earning':
        /commission|fee|charge|markup|margin|earning/i,
    'report|summary|dashboard|analytics|statistic':
        /report|summary|dashboard|analytics|statistic/i,
    'subscription|plan|package|tier|membership|license':
        /subscription|plan|package|tier|membership|license/i,
    'crypto|token|coin|blockchain|nft':
        /crypto|token|coin|blockchain|nft/i,
    'device|terminal|pos|hardware|machine':
        /device|terminal|pos|hardware|machine/i,
    'role|permission|privilege|access':
        /role|permission|privilege|access/i,
    'addon|plugin|extension|module|integration':
        /addon|plugin|extension|module|integration/i,
    'loan|financing|installment|repayment':
        /loan|financing|installment|repayment/i,
    'insurance|policy|claim|premium':
        /insurance|policy|claim|premium/i,
    'delivery|shipping|logistics|courier|rider|driver|pickup':
        /delivery|shipping|logistics|courier|rider|driver|pickup/i,
    'warehouse|storage|bin|rack':
        /warehouse|storage|bin|rack/i,
    'employee|staff|payroll|salary|attendance|leave':
        /employee|staff|payroll|salary|attendance|leave/i,
    'tax|sst|gst|vat|withholding':
        /tax|sst|gst|vat|withholding/i,
    'review|rating|testimonial':
        /review|rating|testimonial/i,
    'cart|basket|wishlist':
        /cart|basket|wishlist/i,
    'contract|agreement|term':
        /contract|agreement|term/i,
};

// ═══════════════════════════════════════════════════════════════════════
// AGGREGATION KEYWORDS (word-boundary safe to avoid "admin" matching "min")
// ═══════════════════════════════════════════════════════════════════════

const AGG_PATTERNS = {
    count: /\b(how many|count of|total number|number of|count all)\b/i,
    sum: /\b(total amount|total sales|total revenue|total deposit|total value|sum of|gross|net total)\b|how much.*(revenue|sales|deposit|money|amount|earn|spend|paid|cost)/i,
    avg: /\b(average|avg|mean|typical)\b/i,
    max: /\b(maximum|highest|largest|biggest|most expensive)\b/i,
    min: /\b(minimum|lowest|smallest|cheapest)\b/i,
};

// ═══════════════════════════════════════════════════════════════════════
// TIME FILTER PATTERNS
// ═══════════════════════════════════════════════════════════════════════

const TIME_PATTERNS = {
    today: /\btoday\b/i,
    yesterday: /\byesterday\b/i,
    this_week: /\bthis\s*week\b/i,
    last_week: /\blast\s*week\b/i,
    this_month: /\bthis\s*month\b/i,
    last_month: /\blast\s*month\b/i,
    last_3_months: /\b(last\s*3\s*months|quarter)\b/i,
    last_6_months: /\b(last\s*6\s*months|half\s*year)\b/i,
    this_year: /\b(this\s*year|ytd|year\s*to\s*date)\b/i,
    last_year: /\blast\s*year\b/i,
    last_7_days: /\b(last\s*7\s*days|past\s*week)\b/i,
    last_30_days: /\b(last\s*30\s*days|past\s*month)\b/i,
    last_90_days: /\b(last\s*90\s*days|past\s*quarter)\b/i,
};

// ═══════════════════════════════════════════════════════════════════════
// STATUS KEYWORDS
// ═══════════════════════════════════════════════════════════════════════

const STATUS_KEYWORDS = {
    active: /\b(active|enabled|live|online)\b/i,
    inactive: /\b(inactive|disabled|offline|dormant|suspended)\b/i,
    pending: /\b(pending|awaiting|in progress|processing|queued)\b/i,
    approved: /\b(approved|accepted|confirmed|verified|completed|success|successful)\b/i,
    rejected: /\b(rejected|failed|denied|declined|cancelled|canceled|refused)\b/i,
    expired: /\b(expired|lapsed|overdue)\b/i,
    blocked: /\b(blocked|banned|blacklisted|frozen|locked)\b/i,
    paid: /\b(paid|settled)\b/i,
    unpaid: /\b(unpaid|outstanding)\b/i,
};

// ═══════════════════════════════════════════════════════════════════════
// NLQ ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════

class NLQEngine {
    constructor() {}

    async generateSQL(opts) {
        const { question, schema, dbType, userId } = opts;
        const tables = Object.keys(schema.tables || {});
        const q = question.toLowerCase().trim();

        if (config.nlq && config.nlq.provider !== 'builtin') {
            const schemaContext = this._buildSchemaContext(schema);
            return await this._callExternalLLM(question, schemaContext, dbType);
        }

        return this._heuristicGenerate(q, schema, tables, dbType);
    }

    async _callExternalLLM(question, schemaContext, dbType) {
        const provider = config.nlq?.provider || 'builtin';
        if (provider === 'bedrock') return await this._callBedrock(question, schemaContext, dbType);
        if (provider === 'openai') return await this._callOpenAI(question, schemaContext, dbType);
        return { sql: '', explanation: 'No LLM configured', chartType: 'table' };
    }

    async _callBedrock(question, schemaContext, dbType) {
        try {
            const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
            const client = new BedrockRuntimeClient({ region: config.nlq?.region || 'us-east-1' });
            const prompt = this._buildPrompt(question, schemaContext, dbType);
            const command = new InvokeModelCommand({
                modelId: config.nlq?.model || 'anthropic.claude-3-haiku-20240307-v1:0',
                contentType: 'application/json', accept: 'application/json',
                body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
            });
            const response = await client.send(command);
            return this._parseAIResponse(JSON.parse(new TextDecoder().decode(response.body)).content?.[0]?.text || '');
        } catch (err) {
            console.error('[NLQ] Bedrock error:', err.message);
            return this._heuristicGenerate(question.toLowerCase(), {}, [], dbType);
        }
    }

    async _callOpenAI(question, schemaContext, dbType) {
        try {
            const prompt = this._buildPrompt(question, schemaContext, dbType);
            const response = await fetch(`${config.nlq?.baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.nlq?.apiKey}` },
                body: JSON.stringify({ model: config.nlq?.model || 'gpt-4o-mini', messages: [
                    { role: 'system', content: 'You are a SQL expert. Respond in JSON: {"sql":"...","explanation":"...","chartType":"table|bar|line|pie|number"}' },
                    { role: 'user', content: prompt }
                ], temperature: 0.1 })
            });
            return this._parseAIResponse((await response.json()).choices?.[0]?.message?.content || '');
        } catch (err) {
            console.error('[NLQ] OpenAI error:', err.message);
            return this._heuristicGenerate(question.toLowerCase(), {}, [], dbType);
        }
    }

    _buildPrompt(question, schemaContext, dbType) {
        return `You are a Text-to-SQL assistant for a ${dbType} database.\n\nDATABASE SCHEMA:\n${schemaContext}\n\nUSER QUESTION: "${question}"\n\nGenerate SQL. Respond in JSON: {"sql":"SELECT ...","explanation":"...","chartType":"table|bar|line|pie|number"}\nRules: Use only schema columns. LIMIT 1000 max. Single value = "number". Time-series = "line" or "bar". Categories = "pie".`;
    }

    _parseAIResponse(text) {
        try {
            return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        } catch (e) {
            const m = text.match(/SELECT[\s\S]*?(?:;|$)/i);
            return { sql: m ? m[0].replace(/;$/, '') : '', explanation: text.substring(0, 200), chartType: 'table' };
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // HEURISTIC ENGINE
    // ═══════════════════════════════════════════════════════════════════

    _heuristicGenerate(q, schema, tables, dbType) {
        const result = { sql: '', explanation: '', chartType: 'table' };
        const isMySQL = dbType === 'mysql' || dbType === 'mariadb';

        // -- HANDLE GREETINGS / NON-QUESTIONS --
        if (/^\s*(hi|hello|hey|morning|good morning|good afternoon|assalamualaikum|salam)\b/i.test(q) && q.split(/\s+/).length <= 4) {
            result.sql = '';
            result.explanation = 'Hello! I am your BI Copilot. Ask me a business question about your data — for example: "How many users?", "Total sales this month", "Top 10 transactions", or "Monthly trend".';
            result.chartType = 'table';
            return result;
        }

        const targetTable = this._findBestTable(q, tables, schema);
        const allCols = (schema.tables?.[targetTable]?.columns || []).map(c => c.name || c);
        // Filter out sensitive columns from display
        const cols = allCols;
        const safeCols = allCols.filter(c => !/password|hash|token|secret|key|salt/i.test(c));
        const safeSelect = safeCols.length > 0 && safeCols.length < allCols.length ? safeCols.join(', ') : '*';
        const whereClause = this._buildWhereClause(q, cols, isMySQL);

        // ORDER MATTERS: check specific patterns BEFORE generic ones.
        // "breakdown" and "trend" must come before "min"/"max" to avoid
        // words like "admin" triggering the min pattern.

        // -- COUNT --
        if (AGG_PATTERNS.count.test(q)) {
            result.sql = `SELECT COUNT(*) AS total FROM ${targetTable}${whereClause}`;
            result.explanation = `Here's the total number of records in your ${this._humanize(targetTable)} data.${whereClause ? ' (filtered by your specified criteria)' : ''}`;
            result.chartType = 'number';
        }
        // -- SUM --
        else if (AGG_PATTERNS.sum.test(q)) {
            const col = this._findAmountColumn(cols, schema, tables, targetTable);
            if (col.found) {
                result.sql = `SELECT SUM(${col.name}) AS total FROM ${col.table}${whereClause}`;
                result.explanation = `The total accumulated ${this._humanize(col.name)} across all ${this._humanize(col.table)} records.${whereClause ? ' Results are filtered based on your criteria.' : ' This represents the complete sum without any filters.'}`;
            } else {
                result.sql = `SELECT COUNT(*) AS total FROM ${targetTable}${whereClause}`;
                result.explanation = `No monetary/amount column was found in ${this._humanize(targetTable)}. Showing the total record count instead.`;
            }
            result.chartType = 'number';
        }
        // -- TREND / MONTHLY / TIME-SERIES --
        else if (/\b(trend|monthly|daily|weekly|over time|growth|per day|per week|per month|per year)\b/i.test(q)) {
            const dateCol = this._findCol(cols, /date|created|time|updated|registered|joined|timestamp/i) || 'created_at';
            const amtCol = this._findCol(cols, /amount|total|price|revenue|sales|value|fee|subtotal/i);
            const valueExpr = amtCol ? `SUM(${amtCol})` : 'COUNT(*)';
            let fmt, alias, period;
            if (/\bdaily\b|\bper day\b/i.test(q)) { fmt = isMySQL ? `DATE(${dateCol})` : `DATE(${dateCol})`; alias = 'day'; period = 'daily'; }
            else if (/\bweekly\b|\bper week\b/i.test(q)) { fmt = isMySQL ? `DATE_FORMAT(${dateCol}, '%Y-W%u')` : `TO_CHAR(${dateCol}, 'IYYY-"W"IW')`; alias = 'week'; period = 'weekly'; }
            else { fmt = isMySQL ? `DATE_FORMAT(${dateCol}, '%Y-%m')` : `TO_CHAR(${dateCol}, 'YYYY-MM')`; alias = 'month'; period = 'monthly'; }
            result.sql = `SELECT ${fmt} AS ${alias}, ${valueExpr} AS total FROM ${targetTable}${whereClause} GROUP BY ${alias} ORDER BY ${alias} DESC LIMIT 12`;
            result.explanation = `This chart shows the ${period} ${amtCol ? this._humanize(amtCol) + ' volume' : 'activity'} for ${this._humanize(targetTable)} over the last 12 periods. Use this to identify growth patterns and seasonal trends.`;
            result.chartType = /daily/i.test(q) ? 'line' : 'bar';
        }
        // -- BREAKDOWN / GROUP BY --
        else if (/\b(breakdown|group by|by status|by type|by category|by role|distribution|segment)\b/i.test(q)) {
            const groupCol = this._detectGroupCol(q, cols) || this._findCol(cols, /^status$|^type$|^category$|^role$|^level$|^tier$/i) || cols[1] || 'id';
            const amtCol = this._findCol(cols, /amount|total|price|revenue|value|fee|subtotal/i);
            const agg = amtCol ? `SUM(${amtCol})` : 'COUNT(*)';
            result.sql = `SELECT ${groupCol}, ${agg} AS total FROM ${targetTable}${whereClause} GROUP BY ${groupCol} ORDER BY total DESC LIMIT 20`;
            result.explanation = `Distribution of ${this._humanize(targetTable)} segmented by ${this._humanize(groupCol)}. This helps you understand the composition and identify which segments require attention.`;
            result.chartType = 'pie';
        }
        // -- TOP-N --
        else if (/\b(top|best|leading|biggest|most)\b/i.test(q)) {
            const n = Math.min(parseInt((q.match(/\d+/) || ['10'])[0]), 100);
            const amtCol = this._findCol(cols, /amount|total|price|revenue|sales|balance|fee|value|score|subtotal|commission/i) || cols[cols.length - 1] || 'id';
            const nameCol = this._findCol(cols, /name|title|label|username|email|phone|company|item_name/i) || cols[0] || 'id';
            result.sql = `SELECT ${nameCol}, ${amtCol} FROM ${targetTable}${whereClause} ORDER BY ${amtCol} DESC LIMIT ${n}`;
            result.explanation = `Top ${n} ${this._humanize(targetTable)} ranked by ${this._humanize(amtCol)} in descending order. These represent your highest-performing entries.`;
            result.chartType = 'bar';
        }
        // -- BOTTOM-N --
        else if (/\b(bottom|worst|least|fewest|lowest)\b/i.test(q)) {
            const n = Math.min(parseInt((q.match(/\d+/) || ['10'])[0]), 100);
            const amtCol = this._findCol(cols, /amount|total|price|revenue|sales|balance|fee|value/i) || cols[cols.length - 1] || 'id';
            const nameCol = this._findCol(cols, /name|title|label|username|email/i) || cols[0] || 'id';
            result.sql = `SELECT ${nameCol}, ${amtCol} FROM ${targetTable}${whereClause} ORDER BY ${amtCol} ASC LIMIT ${n}`;
            result.explanation = `Bottom ${n} ${this._humanize(targetTable)} ranked by ${this._humanize(amtCol)} — the lowest-performing entries that may need review or intervention.`;
            result.chartType = 'bar';
        }
        // -- AVERAGE --
        else if (AGG_PATTERNS.avg.test(q)) {
            const amtCol = this._findCol(cols, /amount|total|price|revenue|fee|value|rating|score|subtotal/i);
            if (amtCol) {
                result.sql = `SELECT ROUND(AVG(${amtCol}), 2) AS average FROM ${targetTable}${whereClause}`;
                result.explanation = `The average ${this._humanize(amtCol)} across your ${this._humanize(targetTable)} dataset. Compare this against individual entries to identify outliers.`;
            } else {
                result.sql = `SELECT COUNT(*) AS total FROM ${targetTable}${whereClause}`;
                result.explanation = `No numeric column found suitable for averaging. Showing total count for ${this._humanize(targetTable)} instead.`;
            }
            result.chartType = 'number';
        }
        // -- MAX --
        else if (AGG_PATTERNS.max.test(q)) {
            const amtCol = this._findCol(cols, /amount|total|price|revenue|fee|value|balance|score|subtotal/i);
            if (amtCol) {
                result.sql = `SELECT MAX(${amtCol}) AS maximum FROM ${targetTable}${whereClause}`;
                result.explanation = `The highest ${this._humanize(amtCol)} value recorded in ${this._humanize(targetTable)}. This is your peak performance metric.`;
                result.chartType = 'number';
            } else {
                result.sql = `SELECT ${safeSelect} FROM ${targetTable}${whereClause} ORDER BY id DESC LIMIT 1`;
                result.explanation = `Showing the most recent record from ${this._humanize(targetTable)}.`;
            }
        }
        // -- MIN --
        else if (AGG_PATTERNS.min.test(q)) {
            const amtCol = this._findCol(cols, /amount|total|price|revenue|fee|value|balance|score|subtotal/i);
            if (amtCol) {
                result.sql = `SELECT MIN(${amtCol}) AS minimum FROM ${targetTable}${whereClause}`;
                result.explanation = `The lowest ${this._humanize(amtCol)} value in ${this._humanize(targetTable)}. Review this to understand your baseline.`;
                result.chartType = 'number';
            } else {
                result.sql = `SELECT ${safeSelect} FROM ${targetTable}${whereClause} ORDER BY id ASC LIMIT 1`;
                result.explanation = `Showing the earliest record from ${this._humanize(targetTable)}.`;
            }
        }
        // -- WHO / WHICH --
        else if (/\b(who|which user|which merchant|which customer)\b/i.test(q)) {
            const typeCol = this._findCol(cols, /^type$|^role$|^status$/i);
            let filter = whereClause;
            if (!filter && typeCol) {
                const m = q.match(/\b(admin|editor|viewer|merchant|agent|seller|buyer|manager|staff|operator)\b/i);
                if (m) filter = ` WHERE ${typeCol} = '${m[1]}'`;
            }
            result.sql = `SELECT ${safeSelect} FROM ${targetTable}${filter} ORDER BY id DESC LIMIT 25`;
            result.explanation = `Here are the matching records from ${this._humanize(targetTable)}.${filter ? ' Filtered to show only relevant entries based on your criteria.' : ''}`;
        }
        // -- RECENT / LATEST --
        else if (/\b(recent|latest|newest|last)\b/i.test(q) && !/\blast\s*(week|month|year|quarter|\d)/i.test(q)) {
            const dateCol = this._findCol(cols, /date|created|time|updated|registered|timestamp/i) || 'created_at';
            const n = Math.min(parseInt((q.match(/\d+/) || ['20'])[0]), 100);
            result.sql = `SELECT ${safeSelect} FROM ${targetTable}${whereClause} ORDER BY ${dateCol} DESC LIMIT ${n}`;
            result.explanation = `The ${n} most recent entries in ${this._humanize(targetTable)}, sorted by newest first. This gives you a real-time snapshot of current activity.`;
        }
        // -- SEARCH / FIND --
        else if (/\b(find|search|look for|locate)\b/i.test(q)) {
            const term = q.replace(/\b(find|search|look\s*for|locate)\b/gi, '').trim();
            const searchCol = this._findCol(cols, /name|title|email|phone|username|description|label/i) || cols[0];
            result.sql = `SELECT ${safeSelect} FROM ${targetTable} WHERE ${searchCol} LIKE '%${term.replace(/'/g, "''")}%' LIMIT 25`;
            result.explanation = `Search results for "${term}" in ${this._humanize(targetTable)}. Matching against the ${this._humanize(searchCol)} field.`;
        }
        // -- LIST / SHOW --
        else if (/\b(list|show|display|all|view)\b/i.test(q)) {
            const n = Math.min(parseInt((q.match(/\d+/) || ['50'])[0]), 100);
            result.sql = `SELECT ${safeSelect} FROM ${targetTable}${whereClause} LIMIT ${n}`;
            result.explanation = `Displaying ${n} records from ${this._humanize(targetTable)}.${whereClause ? ' Filtered by your specified criteria.' : ' Showing all available data.'}`;
        }
        // -- COMPARE --
        else if (/\b(compare|versus|vs|difference)\b/i.test(q)) {
            const groupCol = this._findCol(cols, /^status$|^type$|^category$|^role$/i) || cols[1];
            result.sql = `SELECT ${groupCol}, COUNT(*) AS count FROM ${targetTable}${whereClause} GROUP BY ${groupCol} ORDER BY count DESC`;
            result.explanation = `Comparative analysis of ${this._humanize(targetTable)} grouped by ${this._humanize(groupCol)}. Use this to identify relative strengths across categories.`;
            result.chartType = 'bar';
        }
        // -- GENERIC "how much" / "how many" / "total X" fallback --
        else if (/\b(how (much|many)|total)\b/i.test(q)) {
            result.sql = `SELECT COUNT(*) AS total FROM ${targetTable}${whereClause}`;
            result.explanation = `Here's the total number of records in your ${this._humanize(targetTable)} data.`;
            result.chartType = 'number';
        }
        // -- DEFAULT --
        else {
            result.sql = `SELECT ${safeSelect} FROM ${targetTable}${whereClause} ORDER BY 1 DESC LIMIT 25`;
            result.explanation = `Here's a sample of data from ${this._humanize(targetTable)}. Try asking more specific questions like "how many", "total amount", "monthly trend", or "breakdown by status" for deeper insights.`;
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════

    _findBestTable(q, tables, schema) {
        if (!tables.length) return 'data';
        // If only one table exists, always use it (common for REST APIs)
        if (tables.length === 1) return tables[0];

        // Direct name match (exact, singular, plural, underscore-to-space)
        for (const t of tables) {
            const tl = t.toLowerCase();
            const readable = t.replace(/_/g, ' ').toLowerCase();
            const singular = tl.replace(/s$/, '');
            if (q.includes(tl) || q.includes(readable) || q.includes(singular)) return t;
        }

        // Keyword map
        for (const [keywords, pattern] of Object.entries(TABLE_KEYWORD_MAP)) {
            if (new RegExp(`\\b(${keywords})\\b`, 'i').test(q)) {
                const match = tables.find(t => pattern.test(t));
                if (match) return match;
            }
        }

        // Partial word match
        const words = q.split(/\s+/).filter(w => w.length > 3);
        for (const w of words) {
            const m = tables.find(t => t.toLowerCase().includes(w) || w.includes(t.toLowerCase().replace(/s$/, '')));
            if (m) return m;
        }

        return tables[0];
    }

    _findCol(cols, pattern) {
        return cols.find(c => pattern.test(c)) || null;
    }

    _findAmountColumn(cols, schema, tables, targetTable) {
        const col = this._findCol(cols, /amount|total|price|revenue|sales|value|fee|commission|balance|subtotal|gross|net|cost/i);
        if (col) return { found: true, name: col, table: targetTable };

        // Search other tables
        if (schema.tables) {
            for (const [tName, tInfo] of Object.entries(schema.tables)) {
                const tCols = (tInfo.columns || []).map(c => c.name || c);
                const found = this._findCol(tCols, /amount|total|price|revenue|sales|value|fee|commission|balance|subtotal|gross|net/i);
                if (found) return { found: true, name: found, table: tName };
            }
        }
        return { found: false, name: null, table: targetTable };
    }

    _detectJoin(q, tables, schema, primaryTable) {
        for (const t of tables) {
            if (t === primaryTable) continue;
            const singular = t.replace(/s$/, '').toLowerCase();
            if (q.includes(t.toLowerCase()) || q.includes(singular)) {
                const primaryCols = (schema.tables?.[primaryTable]?.columns || []).map(c => c.name || c);
                const fk = primaryCols.find(c => c.toLowerCase() === singular + '_id');
                if (fk) return { joinTable: t, joinClause: `LEFT JOIN ${t} ON ${primaryTable}.${fk} = ${t}.id` };
            }
        }
        return null;
    }

    _buildWhereClause(q, cols, isMySQL) {
        const conditions = [];

        // Time filters
        const dateCol = this._findCol(cols, /date|created|time|updated|registered|joined|timestamp/i);
        if (dateCol) {
            for (const [period, pattern] of Object.entries(TIME_PATTERNS)) {
                if (pattern.test(q)) {
                    conditions.push(this._timeCond(dateCol, period, isMySQL));
                    break;
                }
            }
        }

        // Status filters
        const statusCol = this._findCol(cols, /^status$|^state$|^is_active$/i);
        if (statusCol) {
            for (const [status, pattern] of Object.entries(STATUS_KEYWORDS)) {
                if (pattern.test(q)) {
                    conditions.push(`${statusCol} = '${status}'`);
                    break;
                }
            }
        }

        // Role/type filter
        const typeCol = this._findCol(cols, /^type$|^role$|^category$/i);
        if (typeCol && typeCol !== statusCol) {
            const m = q.match(/\b(admin|editor|viewer|merchant|agent|seller|buyer|manager|staff|operator|premium|free|basic|pro)\b/i);
            if (m) conditions.push(`${typeCol} = '${m[1]}'`);
        }

        return conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    }

    _timeCond(col, period, mysql) {
        if (mysql) {
            const map = {
                today: `DATE(${col}) = CURDATE()`,
                yesterday: `DATE(${col}) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`,
                this_week: `${col} >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`,
                last_week: `${col} >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())+7) DAY) AND ${col} < DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`,
                this_month: `${col} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
                last_month: `${col} >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND ${col} < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
                last_3_months: `${col} >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)`,
                last_6_months: `${col} >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)`,
                this_year: `YEAR(${col}) = YEAR(CURDATE())`,
                last_year: `YEAR(${col}) = YEAR(CURDATE()) - 1`,
                last_7_days: `${col} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
                last_30_days: `${col} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
                last_90_days: `${col} >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`,
            };
            return map[period] || `${col} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
        }
        const map = {
            today: `DATE(${col}) = CURRENT_DATE`,
            yesterday: `DATE(${col}) = CURRENT_DATE - 1`,
            this_week: `${col} >= DATE_TRUNC('week', CURRENT_DATE)`,
            last_week: `${col} >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND ${col} < DATE_TRUNC('week', CURRENT_DATE)`,
            this_month: `${col} >= DATE_TRUNC('month', CURRENT_DATE)`,
            last_month: `${col} >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND ${col} < DATE_TRUNC('month', CURRENT_DATE)`,
            last_3_months: `${col} >= CURRENT_DATE - INTERVAL '3 months'`,
            last_6_months: `${col} >= CURRENT_DATE - INTERVAL '6 months'`,
            this_year: `EXTRACT(YEAR FROM ${col}) = EXTRACT(YEAR FROM CURRENT_DATE)`,
            last_year: `EXTRACT(YEAR FROM ${col}) = EXTRACT(YEAR FROM CURRENT_DATE) - 1`,
            last_7_days: `${col} >= CURRENT_DATE - INTERVAL '7 days'`,
            last_30_days: `${col} >= CURRENT_DATE - INTERVAL '30 days'`,
            last_90_days: `${col} >= CURRENT_DATE - INTERVAL '90 days'`,
        };
        return map[period] || `${col} >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    _detectGroupCol(q, cols) {
        const m = q.match(/\bby\s+(\w+)/i);
        if (m) { const found = cols.find(c => c.toLowerCase().includes(m[1].toLowerCase())); if (found) return found; }
        return null;
    }

    /**
     * Convert table/column names to human-readable format.
     * e.g. "order_items" -> "Order Items", "created_at" -> "Created At"
     */
    _humanize(str) {
        if (!str) return '';
        return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    _buildSchemaContext(schema) {
        if (!schema?.tables) return 'No schema';
        let ctx = '';
        for (const [t, info] of Object.entries(schema.tables)) {
            const c = (info.columns || []).map(col => `  - ${col.name || col} ${col.type || ''}`).join('\n');
            ctx += `TABLE: ${t}\n${c}\n\n`;
        }
        return ctx;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════════════════════════════════

function decrypt(text) {
    const key = crypto.scryptSync(config.encryptionKey, 'salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

async function processQuestion(userId, connectionId, question) {
    const connResult = await db.query('SELECT * FROM connections WHERE id = $1 AND user_id = $2', [connectionId, userId]);
    if (!connResult.rows.length) throw new Error('Connection not found');

    const conn = connResult.rows[0];
    let password = '';
    try { password = conn.password_encrypted ? decrypt(conn.password_encrypted) : ''; } catch (e) { throw new Error('Failed to decrypt credentials'); }

    const { opts, cleanup } = await withTunnel(
        { host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name, endpoints: ((conn.options || {}).endpoints || []), options: conn.options || {} },
        (conn.options || {}).ssh
    );

    let schema, adapter;
    try {
        adapter = await poolManager.getAdapter(connectionId, conn.db_type, opts);
        schema = await adapter.getSchema();
    } catch (err) { cleanup(); throw new Error('Failed to get schema: ' + err.message); }

    const engine = new NLQEngine();
    const generated = await engine.generateSQL({ question, schema, dbType: conn.db_type, userId });

    // If no SQL generated (e.g. greeting), return explanation only
    if (!generated.sql) {
        cleanup();
        if (generated.explanation) {
            return { success: true, question, sql: '', explanation: generated.explanation, chartType: 'table', columns: [], data: [], rowCount: 0, duration: 0 };
        }
        throw new Error('Could not generate SQL. Try rephrasing your question.');
    }

    // Step 5: Safety Check — only allow SELECT queries (block destructive SQL)
    const safetySql = generated.sql.trim().toUpperCase();
    const dangerousPatterns = /^\s*(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|GRANT|REVOKE|CREATE|EXEC|EXECUTE|CALL)\b/i;
    if (dangerousPatterns.test(generated.sql.trim())) {
        cleanup();
        return {
            success: false,
            question,
            sql: generated.sql,
            explanation: 'This query was blocked for safety. The BI Copilot only executes read-only (SELECT) queries to protect your data.',
            chartType: 'table',
            error: 'Query blocked: Only SELECT statements are allowed. Destructive operations (DROP, DELETE, UPDATE, INSERT) are not permitted through the Copilot.',
            data: null
        };
    }
    // Also reject if it doesn't start with SELECT/WITH/SHOW/DESCRIBE/EXPLAIN
    if (!/^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN)\b/i.test(generated.sql.trim())) {
        cleanup();
        return {
            success: false,
            question,
            sql: generated.sql,
            explanation: 'Only read-only queries are permitted through the BI Copilot.',
            chartType: 'table',
            error: 'Query blocked: Must be a SELECT/SHOW/DESCRIBE statement.',
            data: null
        };
    }

    let results;
    try { results = await adapter.query(generated.sql); } catch (err) {
        cleanup();
        return { success: false, question, sql: generated.sql, explanation: generated.explanation, chartType: generated.chartType, error: err.message, data: null };
    }
    cleanup();

    return { success: true, question, sql: generated.sql, explanation: generated.explanation, chartType: generated.chartType, columns: results.columns, data: results.data, rowCount: results.data?.length || 0, duration: results.duration };
}

module.exports = { NLQEngine, processQuestion };
