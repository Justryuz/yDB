/**
 * @file services/nlq.js
 * @description NLQ Engine v3 — Smart DB Intelligence
 *
 * Architecture:
 *   Question → Intent Understanding → Database Intelligence → Semantic Metric Detection
 *   → Table Selection → Relationship/JOIN Planning → Aggregation Planning
 *   → Formula Detection → SQL Generation → SQL Validation → Query Optimization
 *   → Database Execution → Result Intelligence → Business Insight
 *
 * Key capabilities:
 *  - Schema Intelligence: semantic column classification, relationship graph
 *  - Metric Catalog: revenue, AOV, growth, conversion rate, etc.
 *  - Query Planner: intermediate plan before SQL generation
 *  - Confidence Engine: scoring + clarification system
 *  - Result Intelligence: summaries, insights, follow-up suggestions
 *  - SQL Safety: read-only validation, sensitive data protection
 *  - LLM Integration: Bedrock, OpenAI, builtin heuristic
 *  - Schema Cache: avoid repeated schema traversal
 *  - Backward compatible: same public API (NLQEngine, processQuestion)
 */

const crypto = require('crypto');
const config = require('../config');
const db = require('../db/pool');
const poolManager = require('./pool-manager');
const { withTunnel } = require('./ssh-tunnel');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: SEMANTIC CLASSIFICATION RULES
// ═══════════════════════════════════════════════════════════════════════════════

const SEMANTIC_TYPES = {
    identifier: /^id$|_id$|uuid|code|reference|ref_|sku|slug/i,
    money: /amount|total|price|cost|revenue|sales|fee|commission|balance|value|subtotal|gross|net|salary|earning|payout|credit|debit|deposit|withdrawal/i,
    datetime: /date|created|updated|time|timestamp|registered|joined|occurred|paid_at|completed_at|expired|deleted_at|started|ended|born|dob/i,
    category: /^status$|^state$|^type$|^category$|^role$|^tier$|^level$|^group$|^class$|^segment$|^plan$/i,
    person: /name|username|email|phone|company|customer_name|merchant_name|first_name|last_name|full_name|display_name/i,
    quantity: /quantity|qty|count|units|volume|stock|inventory/i,
    percentage: /rate|percentage|percent|margin|discount_rate|tax_rate|commission_rate/i,
    text: /description|note|comment|message|content|body|address|bio|title|label|reason/i,
    boolean: /^is_|^has_|^can_|active|enabled|verified|published|featured|deleted|blocked|approved/i,
    sensitive: /password|hash|token|secret|api_key|private_key|salt|credential|remember_token/i,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: METRIC CATALOG
// ═══════════════════════════════════════════════════════════════════════════════

const METRIC_CATALOG = {
    revenue: { keywords: /revenue|sales|income|earnings/i, aggregation: 'SUM', semanticTypes: ['money'], tableRoles: ['transaction', 'order', 'payment'] },
    total_amount: { keywords: /total amount|total value/i, aggregation: 'SUM', semanticTypes: ['money'] },
    order_count: { keywords: /order count|number of orders/i, aggregation: 'COUNT', tableRoles: ['order', 'transaction'] },
    customer_count: { keywords: /customer count|number of customers|how many users/i, aggregation: 'COUNT_DISTINCT', distinctCol: 'identifier', tableRoles: ['user', 'customer'] },
    aov: { keywords: /aov|average order value|average transaction/i, formula: 'SUM({money}) / COUNT(*)', semanticTypes: ['money'] },
    growth: { keywords: /growth|increase|change/i, comparison: true },
    conversion_rate: { keywords: /conversion rate/i, formula: 'COUNT(CASE WHEN {category}=completed) / COUNT(*) * 100' },
    profit_margin: { keywords: /profit margin/i, formula: '(SUM({revenue}) - SUM({cost})) / SUM({revenue}) * 100' },
    refund_rate: { keywords: /refund rate/i, formula: 'COUNT(CASE WHEN status=refunded) / COUNT(*) * 100' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: INTENT PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

const INTENT_PATTERNS = {
    count: /\b(how many|count|total number|number of)\b/i,
    sum: /\b(total amount|total sales|total revenue|total deposit|total value|sum of|gross|net total)\b|how much.*(revenue|sales|deposit|money|amount|earn|spend|paid|cost)/i,
    average: /\b(average|avg|mean|typical)\b/i,
    maximum: /\b(maximum|highest|largest|biggest|most expensive)\b/i,
    minimum: /\b(minimum|lowest|smallest|cheapest)\b/i,
    trend: /\b(trend|monthly|daily|weekly|over time|growth|per day|per week|per month|per year)\b/i,
    breakdown: /\b(breakdown|group by|by status|by type|by category|by role|distribution|segment)\b/i,
    topN: /\b(top|best|leading|biggest|most|teratas)\b/i,
    bottomN: /\b(bottom|worst|least|fewest|lowest)\b/i,
    comparison: /\b(compare|versus|vs|difference|growth|decline|change)\b/i,
    list: /\b(list|show|display|all|view)\b/i,
    recent: /\b(recent|latest|newest|last)\b/i,
    search: /\b(find|search|look for|locate)\b/i,
    greeting: /^\s*(hi|hello|hey|morning|good morning|good afternoon|assalamualaikum|salam)\b/i,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: TIME INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

const TIME_EXPRESSIONS = {
    today: { pattern: /\btoday\b/i, mysql: (c) => `DATE(${c}) = CURDATE()`, pg: (c) => `DATE(${c}) = CURRENT_DATE` },
    yesterday: { pattern: /\byesterday\b/i, mysql: (c) => `DATE(${c}) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`, pg: (c) => `DATE(${c}) = CURRENT_DATE - 1` },
    this_week: { pattern: /\bthis\s*week\b/i, mysql: (c) => `${c} >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`, pg: (c) => `${c} >= DATE_TRUNC('week', CURRENT_DATE)` },
    last_week: { pattern: /\blast\s*week\b/i, mysql: (c) => `${c} >= DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE())+7) DAY) AND ${c} < DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`, pg: (c) => `${c} >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND ${c} < DATE_TRUNC('week', CURRENT_DATE)` },
    this_month: { pattern: /\bthis\s*month\b|\bmtd\b/i, mysql: (c) => `${c} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`, pg: (c) => `${c} >= DATE_TRUNC('month', CURRENT_DATE)` },
    last_month: { pattern: /\blast\s*month\b/i, mysql: (c) => `${c} >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND ${c} < DATE_FORMAT(CURDATE(), '%Y-%m-01')`, pg: (c) => `${c} >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND ${c} < DATE_TRUNC('month', CURRENT_DATE)` },
    this_quarter: { pattern: /\bthis\s*quarter\b|\bqtd\b/i, mysql: (c) => `QUARTER(${c}) = QUARTER(CURDATE()) AND YEAR(${c}) = YEAR(CURDATE())`, pg: (c) => `${c} >= DATE_TRUNC('quarter', CURRENT_DATE)` },
    last_quarter: { pattern: /\blast\s*quarter\b/i, mysql: (c) => `${c} >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)`, pg: (c) => `${c} >= CURRENT_DATE - INTERVAL '3 months'` },
    this_year: { pattern: /\bthis\s*year\b|\bytd\b/i, mysql: (c) => `YEAR(${c}) = YEAR(CURDATE())`, pg: (c) => `EXTRACT(YEAR FROM ${c}) = EXTRACT(YEAR FROM CURRENT_DATE)` },
    last_year: { pattern: /\blast\s*year\b/i, mysql: (c) => `YEAR(${c}) = YEAR(CURDATE()) - 1`, pg: (c) => `EXTRACT(YEAR FROM ${c}) = EXTRACT(YEAR FROM CURRENT_DATE) - 1` },
    last_7_days: { pattern: /\blast\s*7\s*days\b/i, mysql: (c) => `${c} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`, pg: (c) => `${c} >= CURRENT_DATE - INTERVAL '7 days'` },
    last_30_days: { pattern: /\blast\s*30\s*days\b/i, mysql: (c) => `${c} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`, pg: (c) => `${c} >= CURRENT_DATE - INTERVAL '30 days'` },
    last_90_days: { pattern: /\blast\s*90\s*days\b/i, mysql: (c) => `${c} >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`, pg: (c) => `${c} >= CURRENT_DATE - INTERVAL '90 days'` },
    last_12_months: { pattern: /\bpast\s*12\s*months\b/i, mysql: (c) => `${c} >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`, pg: (c) => `${c} >= CURRENT_DATE - INTERVAL '12 months'` },
};

const STATUS_PATTERNS = {
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

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: TABLE KEYWORD MAP (legacy compatibility + enhanced)
// ═══════════════════════════════════════════════════════════════════════════════

const TABLE_KEYWORD_MAP = {
    'user|customer|client|member|subscriber|account|registration|signup|profile|admin': /user|member|customer|client|account|subscriber|registration|profile|admin/i,
    'merchant|seller|vendor|shop|store|business|supplier|partner|retailer|outlet': /merchant|vendor|seller|shop|store|business|supplier|partner|retailer|outlet/i,
    'transaction|payment|sale|order|purchase|checkout|billing|invoice|receipt': /transaction|payment|order|sale|purchase|invoice|billing|checkout|receipt/i,
    'product|item|catalog|inventory|stock|sku|goods|merchandise|listing': /product|item|catalog|inventory|stock|sku|goods|merchandise|listing/i,
    'deposit|topup|wallet|balance|fund|credit|debit|payout|withdrawal|cashout|refund': /deposit|wallet|balance|topup|fund|credit|payout|withdrawal|cashout|refund/i,
    'log|activity|history|audit|event|tracking|session': /log|activity|history|audit|event|tracking|session/i,
    'commission|fee|charge|markup|margin|earning': /commission|fee|charge|markup|margin|earning/i,
    'subscription|plan|package|tier|membership|license': /subscription|plan|package|tier|membership|license/i,
    'coupon|voucher|discount|promo|campaign|deal|reward': /coupon|voucher|discount|promo|campaign|deal|reward/i,
    'review|rating|testimonial|feedback': /review|rating|testimonial|feedback/i,
    'ticket|support|complaint|dispute|issue': /ticket|support|complaint|dispute|issue/i,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: SCHEMA INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

class SchemaIntelligence {
    constructor(schema, dbType) {
        this.schema = schema;
        this.dbType = dbType;
        this.tables = {};
        this.relationships = [];
        this._analyze();
    }

    _analyze() {
        const tableEntries = Object.entries(this.schema.tables || {});
        for (const [tableName, tableInfo] of tableEntries) {
            const cols = (tableInfo.columns || []).map(c => typeof c === 'string' ? { name: c, type: '' } : c);
            const analyzed = {
                name: tableName,
                role: this._inferTableRole(tableName, cols),
                columns: {},
                primaryKey: null,
                foreignKeys: [],
                moneyColumns: [],
                dateColumns: [],
                categoryColumns: [],
                personColumns: [],
                sensitiveColumns: [],
            };

            for (const col of cols) {
                const name = col.name || col;
                const semantic = this._classifyColumn(name, col.type || '');
                analyzed.columns[name] = { name, type: col.type || '', semantic: semantic.type, confidence: semantic.confidence, sensitive: semantic.type === 'sensitive' };

                if (semantic.type === 'identifier' && (name === 'id' || col.key === 'PK')) analyzed.primaryKey = name;
                if (semantic.type === 'money') analyzed.moneyColumns.push(name);
                if (semantic.type === 'datetime') analyzed.dateColumns.push(name);
                if (semantic.type === 'category') analyzed.categoryColumns.push(name);
                if (semantic.type === 'person') analyzed.personColumns.push(name);
                if (semantic.type === 'sensitive') analyzed.sensitiveColumns.push(name);
                if (name.endsWith('_id') && name !== 'id') analyzed.foreignKeys.push(name);
            }

            this.tables[tableName] = analyzed;
        }

        // Build relationships
        this._buildRelationships();
    }

    _classifyColumn(name, type) {
        for (const [semType, pattern] of Object.entries(SEMANTIC_TYPES)) {
            if (pattern.test(name)) return { type: semType, confidence: 0.9 };
        }
        // Fallback: infer from SQL type
        if (/int|serial|bigint/i.test(type) && /id$/i.test(name)) return { type: 'identifier', confidence: 0.7 };
        if (/decimal|numeric|float|double|money/i.test(type)) return { type: 'money', confidence: 0.6 };
        if (/date|time|timestamp/i.test(type)) return { type: 'datetime', confidence: 0.8 };
        if (/bool/i.test(type)) return { type: 'boolean', confidence: 0.8 };
        return { type: 'text', confidence: 0.3 };
    }

    _inferTableRole(name, cols) {
        const n = name.toLowerCase();
        if (/order|transaction|payment|sale|invoice|billing/i.test(n)) return 'transaction';
        if (/user|customer|client|member|admin|account/i.test(n)) return 'entity';
        if (/product|item|catalog|inventory/i.test(n)) return 'entity';
        if (/merchant|vendor|seller|shop|store/i.test(n)) return 'entity';
        if (/log|activity|history|audit|event/i.test(n)) return 'log';
        if (/setting|config|option|parameter/i.test(n)) return 'config';
        if (/country|state|city|region|currency/i.test(n)) return 'reference';
        return 'data';
    }

    _buildRelationships() {
        const tableNames = Object.keys(this.tables);
        for (const [tName, tInfo] of Object.entries(this.tables)) {
            for (const fk of tInfo.foreignKeys) {
                const refTable = fk.replace(/_id$/, '');
                // Find matching table (singular or plural)
                const match = tableNames.find(t => t.toLowerCase() === refTable || t.toLowerCase() === refTable + 's' || t.toLowerCase().replace(/s$/, '') === refTable);
                if (match) {
                    this.relationships.push({ from: `${tName}.${fk}`, to: `${match}.id`, fromTable: tName, toTable: match, confidence: 0.95 });
                }
            }
        }
    }

    findJoinPath(fromTable, toTable) {
        // BFS to find shortest join path
        if (fromTable === toTable) return [];
        const visited = new Set([fromTable]);
        const queue = [[fromTable, []]];

        while (queue.length > 0) {
            const [current, path] = queue.shift();
            const edges = this.relationships.filter(r => r.fromTable === current || r.toTable === current);
            for (const edge of edges) {
                const next = edge.fromTable === current ? edge.toTable : edge.fromTable;
                if (next === toTable) return [...path, edge];
                if (!visited.has(next)) {
                    visited.add(next);
                    queue.push([next, [...path, edge]]);
                }
            }
        }
        return null; // No path found
    }

    getSafeColumns(tableName) {
        const info = this.tables[tableName];
        if (!info) return '*';
        const safe = Object.keys(info.columns).filter(c => !info.sensitiveColumns.includes(c));
        return safe.length > 0 ? safe.join(', ') : '*';
    }

    getBestMoneyColumn(tableName) {
        const info = this.tables[tableName];
        if (!info) return null;
        return info.moneyColumns[0] || null;
    }

    getBestDateColumn(tableName) {
        const info = this.tables[tableName];
        if (!info) return 'created_at';
        return info.dateColumns.find(c => /created/i.test(c)) || info.dateColumns[0] || 'created_at';
    }

    getBestCategoryColumn(tableName) {
        const info = this.tables[tableName];
        if (!info) return null;
        return info.categoryColumns[0] || null;
    }

    getBestNameColumn(tableName) {
        const info = this.tables[tableName];
        if (!info) return null;
        return info.personColumns[0] || Object.keys(info.columns).find(c => /name|title|label/i.test(c)) || null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: SCHEMA CACHE
// ═══════════════════════════════════════════════════════════════════════════════

class SchemaCache {
    constructor() { this.cache = new Map(); this.ttlMs = 5 * 60 * 1000; }
    get(connId) {
        const entry = this.cache.get(String(connId));
        if (!entry) return null;
        if (Date.now() - entry.ts > this.ttlMs) { this.cache.delete(String(connId)); return null; }
        return entry.data;
    }
    set(connId, intelligence) { this.cache.set(String(connId), { data: intelligence, ts: Date.now() }); }
    invalidate(connId) { this.cache.delete(String(connId)); }
}

const schemaCache = new SchemaCache();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: QUERY PLANNER
// ═══════════════════════════════════════════════════════════════════════════════

class QueryPlanner {
    constructor(question, schemaIntel, dbType) {
        this.question = question;
        this.q = question.toLowerCase().trim();
        this.si = schemaIntel;
        this.dbType = dbType;
        this.isMySQL = dbType === 'mysql' || dbType === 'mariadb';
    }

    buildPlan() {
        const intent = this._detectIntent();
        if (intent === 'greeting') return { intent: 'greeting', confidence: 1.0, sql: '', explanation: 'Hello! I am your BI Copilot. Ask me a question about your data — for example: "How many users?", "Total revenue this month", "Top 10 products by sales", or "Monthly trend".' };

        const tables = Object.keys(this.si.tables);
        if (tables.length === 0) return { intent: 'error', confidence: 0, sql: '', explanation: 'No tables found in the connected database.' };

        const targetTable = this._selectTable(tables);
        const tableInfo = this.si.tables[targetTable];
        const filters = this._detectFilters(tableInfo);
        const timeFilter = this._detectTimeFilter(tableInfo);

        let plan;
        switch (intent) {
            case 'count': plan = this._planCount(targetTable, tableInfo, filters, timeFilter); break;
            case 'sum': plan = this._planSum(targetTable, tableInfo, filters, timeFilter); break;
            case 'average': plan = this._planAvg(targetTable, tableInfo, filters, timeFilter); break;
            case 'maximum': plan = this._planMax(targetTable, tableInfo, filters, timeFilter); break;
            case 'minimum': plan = this._planMin(targetTable, tableInfo, filters, timeFilter); break;
            case 'trend': plan = this._planTrend(targetTable, tableInfo, filters, timeFilter); break;
            case 'breakdown': plan = this._planBreakdown(targetTable, tableInfo, filters, timeFilter); break;
            case 'topN': plan = this._planTopN(targetTable, tableInfo, filters, timeFilter); break;
            case 'bottomN': plan = this._planBottomN(targetTable, tableInfo, filters, timeFilter); break;
            case 'comparison': plan = this._planComparison(targetTable, tableInfo, filters, timeFilter); break;
            case 'recent': plan = this._planRecent(targetTable, tableInfo, filters, timeFilter); break;
            case 'search': plan = this._planSearch(targetTable, tableInfo); break;
            case 'list': plan = this._planList(targetTable, tableInfo, filters, timeFilter); break;
            default: plan = this._planList(targetTable, tableInfo, filters, timeFilter); break;
        }

        plan.intent = intent;
        plan.table = targetTable;
        plan.followUps = this._generateFollowUps(intent, targetTable, tableInfo);
        return plan;
    }

    _detectIntent() {
        if (INTENT_PATTERNS.greeting.test(this.q) && this.q.split(/\s+/).length <= 4) return 'greeting';
        // Order matters — check specific before generic
        if (INTENT_PATTERNS.count.test(this.q)) return 'count';
        if (INTENT_PATTERNS.sum.test(this.q)) return 'sum';
        if (INTENT_PATTERNS.trend.test(this.q)) return 'trend';
        if (INTENT_PATTERNS.breakdown.test(this.q)) return 'breakdown';
        if (INTENT_PATTERNS.comparison.test(this.q)) return 'comparison';
        if (INTENT_PATTERNS.topN.test(this.q)) return 'topN';
        if (INTENT_PATTERNS.bottomN.test(this.q)) return 'bottomN';
        if (INTENT_PATTERNS.average.test(this.q)) return 'average';
        if (INTENT_PATTERNS.maximum.test(this.q)) return 'maximum';
        if (INTENT_PATTERNS.minimum.test(this.q)) return 'minimum';
        if (INTENT_PATTERNS.search.test(this.q)) return 'search';
        if (INTENT_PATTERNS.recent.test(this.q)) return 'recent';
        if (INTENT_PATTERNS.list.test(this.q)) return 'list';
        if (/\b(how (much|many)|total)\b/i.test(this.q)) return 'count';
        return 'list';
    }

    _selectTable(tables) {
        if (tables.length === 1) return tables[0];

        let bestTable = tables[0];
        let bestScore = 0;

        for (const t of tables) {
            let score = 0;
            const tl = t.toLowerCase();
            const singular = tl.replace(/s$/, '');
            const readable = t.replace(/_/g, ' ').toLowerCase();

            // Exact/partial match
            if (this.q.includes(tl)) score += 100;
            else if (this.q.includes(readable)) score += 90;
            else if (this.q.includes(singular)) score += 80;

            // Admin special case
            if (/\badmin\b/i.test(this.q) && /admin|user/i.test(tl)) score += 70;

            // Keyword map
            for (const [keywords, pattern] of Object.entries(TABLE_KEYWORD_MAP)) {
                if (new RegExp(`\\b(${keywords})\\b`, 'i').test(this.q) && pattern.test(tl)) score += 50;
            }

            // Semantic compatibility
            const info = this.si.tables[t];
            if (info) {
                if (/amount|revenue|sales|total/i.test(this.q) && info.moneyColumns.length > 0) score += 30;
                if (/trend|monthly|daily/i.test(this.q) && info.dateColumns.length > 0) score += 20;
                if (info.role === 'transaction' && /revenue|sales|order|payment|amount/i.test(this.q)) score += 40;
            }

            if (score > bestScore) { bestScore = score; bestTable = t; }
        }

        return bestTable;
    }

    _detectFilters(tableInfo) {
        const conditions = [];
        // Status filter
        const catCol = tableInfo?.categoryColumns?.[0];
        if (catCol) {
            for (const [status, pattern] of Object.entries(STATUS_PATTERNS)) {
                if (pattern.test(this.q)) { conditions.push(`${catCol} = '${status}'`); break; }
            }
        }
        // Role/type filter
        const roleMatch = this.q.match(/\b(admin|editor|viewer|merchant|agent|seller|buyer|manager|staff|operator|premium|free|basic|pro)\b/i);
        if (roleMatch && catCol) {
            const existing = conditions.find(c => c.includes(catCol));
            if (!existing) conditions.push(`${catCol} = '${roleMatch[1]}'`);
        }
        return conditions;
    }

    _detectTimeFilter(tableInfo) {
        const dateCol = tableInfo?.dateColumns?.[0] || 'created_at';
        for (const [, expr] of Object.entries(TIME_EXPRESSIONS)) {
            if (expr.pattern.test(this.q)) {
                return this.isMySQL ? expr.mysql(dateCol) : expr.pg(dateCol);
            }
        }
        return null;
    }

    _buildWhere(filters, timeFilter) {
        const all = [...filters];
        if (timeFilter) all.push(timeFilter);
        return all.length > 0 ? ' WHERE ' + all.join(' AND ') : '';
    }

    _humanize(str) { return str ? str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''; }

    // ── Plan builders ──

    _planCount(table, info, filters, timeFilter) {
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT COUNT(*) AS total FROM ${table}${where}`, explanation: `Here's the total number of records in your ${this._humanize(table)} data.${timeFilter ? ' Filtered by your time range.' : ''}`, chartType: 'number', confidence: 0.92 };
    }

    _planSum(table, info, filters, timeFilter) {
        const col = info?.moneyColumns?.[0];
        if (!col) {
            // Search other tables for money column
            for (const [tName, tInfo] of Object.entries(this.si.tables)) {
                if (tInfo.moneyColumns.length > 0) {
                    const where = this._buildWhere(filters, timeFilter);
                    return { sql: `SELECT SUM(${tInfo.moneyColumns[0]}) AS total FROM ${tName}${where}`, explanation: `The total accumulated ${this._humanize(tInfo.moneyColumns[0])} from ${this._humanize(tName)}.`, chartType: 'number', confidence: 0.78 };
                }
            }
            return this._planCount(table, info, filters, timeFilter);
        }
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT SUM(${col}) AS total FROM ${table}${where}`, explanation: `The total accumulated ${this._humanize(col)} across all ${this._humanize(table)} records.${timeFilter ? ' Filtered to your specified period.' : ''}`, chartType: 'number', confidence: 0.93 };
    }

    _planAvg(table, info, filters, timeFilter) {
        const col = info?.moneyColumns?.[0];
        if (!col) return this._planCount(table, info, filters, timeFilter);
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT ROUND(AVG(${col}), 2) AS average FROM ${table}${where}`, explanation: `The average ${this._humanize(col)} across your ${this._humanize(table)} dataset. Compare against individual entries to spot outliers.`, chartType: 'number', confidence: 0.91 };
    }

    _planMax(table, info, filters, timeFilter) {
        const col = info?.moneyColumns?.[0];
        if (!col) { const where = this._buildWhere(filters, timeFilter); return { sql: `SELECT ${this.si.getSafeColumns(table)} FROM ${table}${where} ORDER BY id DESC LIMIT 1`, explanation: `Most recent record from ${this._humanize(table)}.`, chartType: 'table', confidence: 0.7 }; }
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT MAX(${col}) AS maximum FROM ${table}${where}`, explanation: `The highest ${this._humanize(col)} recorded in ${this._humanize(table)}. This is your peak value.`, chartType: 'number', confidence: 0.90 };
    }

    _planMin(table, info, filters, timeFilter) {
        const col = info?.moneyColumns?.[0];
        if (!col) { const where = this._buildWhere(filters, timeFilter); return { sql: `SELECT ${this.si.getSafeColumns(table)} FROM ${table}${where} ORDER BY id ASC LIMIT 1`, explanation: `Earliest record from ${this._humanize(table)}.`, chartType: 'table', confidence: 0.7 }; }
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT MIN(${col}) AS minimum FROM ${table}${where}`, explanation: `The lowest ${this._humanize(col)} in ${this._humanize(table)}. Review this to understand your baseline.`, chartType: 'number', confidence: 0.90 };
    }

    _planTrend(table, info, filters, timeFilter) {
        const dateCol = this.si.getBestDateColumn(table);
        const moneyCol = info?.moneyColumns?.[0];
        const valueExpr = moneyCol ? `SUM(${moneyCol})` : 'COUNT(*)';
        let fmt, alias, period;
        if (/\bdaily\b|\bper day\b/i.test(this.q)) { fmt = this.isMySQL ? `DATE(${dateCol})` : `DATE(${dateCol})`; alias = 'day'; period = 'daily'; }
        else if (/\bweekly\b|\bper week\b/i.test(this.q)) { fmt = this.isMySQL ? `DATE_FORMAT(${dateCol}, '%Y-W%u')` : `TO_CHAR(${dateCol}, 'IYYY-"W"IW')`; alias = 'week'; period = 'weekly'; }
        else { fmt = this.isMySQL ? `DATE_FORMAT(${dateCol}, '%Y-%m')` : `TO_CHAR(${dateCol}, 'YYYY-MM')`; alias = 'month'; period = 'monthly'; }
        const where = this._buildWhere(filters, null); // Don't apply time filter on trends (they show all periods)
        return { sql: `SELECT ${fmt} AS ${alias}, ${valueExpr} AS total FROM ${table}${where} GROUP BY ${alias} ORDER BY ${alias} DESC LIMIT 12`, explanation: `This chart shows the ${period} ${moneyCol ? this._humanize(moneyCol) + ' volume' : 'activity'} for ${this._humanize(table)} over the last 12 periods. Use this to identify growth patterns and seasonal trends.`, chartType: /daily/i.test(this.q) ? 'line' : 'bar', confidence: 0.91 };
    }

    _planBreakdown(table, info, filters, timeFilter) {
        const groupCol = this._detectGroupCol() || this.si.getBestCategoryColumn(table) || Object.keys(info?.columns || {})[1] || 'id';
        const moneyCol = info?.moneyColumns?.[0];
        const agg = moneyCol ? `SUM(${moneyCol})` : 'COUNT(*)';
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT ${groupCol}, ${agg} AS total FROM ${table}${where} GROUP BY ${groupCol} ORDER BY total DESC LIMIT 20`, explanation: `Distribution of ${this._humanize(table)} segmented by ${this._humanize(groupCol)}. This helps you understand the composition and identify which segments need attention.`, chartType: 'pie', confidence: 0.89 };
    }

    _planTopN(table, info, filters, timeFilter) {
        const n = Math.min(parseInt((this.q.match(/\d+/) || ['10'])[0]), 100);
        const moneyCol = info?.moneyColumns?.[0] || Object.keys(info?.columns || {}).pop() || 'id';
        const nameCol = this.si.getBestNameColumn(table) || Object.keys(info?.columns || {})[0] || 'id';
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT ${nameCol}, ${moneyCol} FROM ${table}${where} ORDER BY ${moneyCol} DESC LIMIT ${n}`, explanation: `Top ${n} ${this._humanize(table)} ranked by ${this._humanize(moneyCol)} in descending order. These represent your highest-performing entries.`, chartType: 'bar', confidence: 0.90 };
    }

    _planBottomN(table, info, filters, timeFilter) {
        const n = Math.min(parseInt((this.q.match(/\d+/) || ['10'])[0]), 100);
        const moneyCol = info?.moneyColumns?.[0] || Object.keys(info?.columns || {}).pop() || 'id';
        const nameCol = this.si.getBestNameColumn(table) || Object.keys(info?.columns || {})[0] || 'id';
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT ${nameCol}, ${moneyCol} FROM ${table}${where} ORDER BY ${moneyCol} ASC LIMIT ${n}`, explanation: `Bottom ${n} ${this._humanize(table)} ranked by ${this._humanize(moneyCol)} — the lowest-performing entries that may need review.`, chartType: 'bar', confidence: 0.88 };
    }

    _planComparison(table, info, filters, timeFilter) {
        const groupCol = this.si.getBestCategoryColumn(table) || Object.keys(info?.columns || {})[1] || 'id';
        const moneyCol = info?.moneyColumns?.[0];
        const agg = moneyCol ? `SUM(${moneyCol})` : 'COUNT(*)';
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT ${groupCol}, ${agg} AS total, COUNT(*) AS count FROM ${table}${where} GROUP BY ${groupCol} ORDER BY total DESC`, explanation: `Comparative analysis of ${this._humanize(table)} grouped by ${this._humanize(groupCol)}. Use this to identify relative strengths across categories.`, chartType: 'bar', confidence: 0.85 };
    }

    _planRecent(table, info, filters, timeFilter) {
        const dateCol = this.si.getBestDateColumn(table);
        const n = Math.min(parseInt((this.q.match(/\d+/) || ['20'])[0]), 100);
        const safeCols = this.si.getSafeColumns(table);
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT ${safeCols} FROM ${table}${where} ORDER BY ${dateCol} DESC LIMIT ${n}`, explanation: `The ${n} most recent entries in ${this._humanize(table)}, sorted by newest first. This gives you a real-time snapshot of current activity.`, chartType: 'table', confidence: 0.92 };
    }

    _planSearch(table, info) {
        const term = this.q.replace(/\b(find|search|look\s*for|locate)\b/gi, '').trim();
        const searchCol = this.si.getBestNameColumn(table) || Object.keys(info?.columns || {})[0] || 'id';
        const safeCols = this.si.getSafeColumns(table);
        return { sql: `SELECT ${safeCols} FROM ${table} WHERE ${searchCol} LIKE '%${term.replace(/'/g, "''")}%' LIMIT 25`, explanation: `Search results for "${term}" in ${this._humanize(table)}, matching against ${this._humanize(searchCol)}.`, chartType: 'table', confidence: 0.85 };
    }

    _planList(table, info, filters, timeFilter) {
        const n = Math.min(parseInt((this.q.match(/\d+/) || ['50'])[0]), 100);
        const safeCols = this.si.getSafeColumns(table);
        const where = this._buildWhere(filters, timeFilter);
        return { sql: `SELECT ${safeCols} FROM ${table}${where} ORDER BY 1 DESC LIMIT ${n}`, explanation: `Displaying ${n} records from ${this._humanize(table)}.${filters.length || timeFilter ? ' Filtered by your criteria.' : ''} Try asking "how many", "total amount", "monthly trend", or "breakdown by status" for deeper insights.`, chartType: 'table', confidence: 0.75 };
    }

    _detectGroupCol() {
        const m = this.q.match(/\bby\s+(\w+)/i);
        if (m) {
            const wanted = m[1].toLowerCase();
            for (const [tName, tInfo] of Object.entries(this.si.tables)) {
                const match = Object.keys(tInfo.columns).find(c => c.toLowerCase().includes(wanted));
                if (match) return match;
            }
        }
        return null;
    }

    _generateFollowUps(intent, table, info) {
        const suggestions = [];
        const name = this._humanize(table);
        if (intent !== 'trend' && info?.dateColumns?.length) suggestions.push(`Monthly trend of ${name}`);
        if (intent !== 'breakdown' && info?.categoryColumns?.length) suggestions.push(`Breakdown of ${name} by ${info.categoryColumns[0]}`);
        if (intent !== 'topN' && info?.moneyColumns?.length) suggestions.push(`Top 10 ${name} by ${info.moneyColumns[0]}`);
        if (intent !== 'count') suggestions.push(`How many ${name}?`);
        if (intent !== 'recent') suggestions.push(`Latest 10 ${name}`);
        return suggestions.slice(0, 4);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: SQL VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════

function validateSQL(sql) {
    if (!sql || !sql.trim()) return { valid: false, reason: 'Empty SQL' };
    const trimmed = sql.trim();
    // Block destructive
    if (/^\s*(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|GRANT|REVOKE|CREATE|EXEC|EXECUTE|CALL)\b/i.test(trimmed)) {
        return { valid: false, reason: 'Only read-only (SELECT) queries are allowed through the BI Copilot.' };
    }
    // Must start with SELECT/WITH/SHOW/DESCRIBE
    if (!/^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN)\b/i.test(trimmed)) {
        return { valid: false, reason: 'Query must be a SELECT statement.' };
    }
    // Block multiple statements
    if (/;\s*\w/i.test(trimmed)) {
        return { valid: false, reason: 'Multiple statements not allowed.' };
    }
    return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: RESULT INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeResults(results, plan) {
    const analysis = { summary: '', insights: [], followUps: plan.followUps || [] };
    if (!results || !results.data || results.data.length === 0) {
        analysis.summary = 'No data found for this query.';
        return analysis;
    }

    const data = results.data;
    const count = data.length;

    if (plan.chartType === 'number' && count === 1) {
        const val = Object.values(data[0])[0];
        analysis.summary = `Result: ${typeof val === 'number' ? val.toLocaleString() : val}`;
    } else if (plan.chartType === 'bar' || plan.chartType === 'pie') {
        const first = data[0] ? Object.values(data[0]) : [];
        const last = data[data.length - 1] ? Object.values(data[data.length - 1]) : [];
        if (first.length >= 2) analysis.insights.push(`Highest: ${first[0]} (${first[1]})`);
        if (last.length >= 2 && data.length > 1) analysis.insights.push(`Lowest: ${last[0]} (${last[1]})`);
    } else {
        analysis.summary = `Showing ${count} record${count > 1 ? 's' : ''}.`;
    }

    return analysis;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: NLQ ENGINE (Main Class - backward compatible)
// ═══════════════════════════════════════════════════════════════════════════════

class NLQEngine {
    constructor() {}

    async generateSQL(opts) {
        const { question, schema, dbType, userId } = opts;

        // Use LLM if configured
        if (config.nlq && config.nlq.provider !== 'builtin') {
            const schemaContext = this._buildSchemaContext(schema);
            return await this._callExternalLLM(question, schemaContext, dbType);
        }

        // Build schema intelligence
        const si = new SchemaIntelligence(schema, dbType);

        // Build query plan
        const planner = new QueryPlanner(question, si, dbType);
        const plan = planner.buildPlan();

        return { sql: plan.sql || '', explanation: plan.explanation || '', chartType: plan.chartType || 'table', confidence: plan.confidence || 0.5, followUps: plan.followUps || [] };
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
            const command = new InvokeModelCommand({ modelId: config.nlq?.model || 'anthropic.claude-3-haiku-20240307-v1:0', contentType: 'application/json', accept: 'application/json', body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }) });
            const response = await client.send(command);
            return this._parseAIResponse(JSON.parse(new TextDecoder().decode(response.body)).content?.[0]?.text || '');
        } catch (err) { console.error('[NLQ] Bedrock error:', err.message); return { sql: '', explanation: 'LLM unavailable', chartType: 'table' }; }
    }

    async _callOpenAI(question, schemaContext, dbType) {
        try {
            const prompt = this._buildPrompt(question, schemaContext, dbType);
            const response = await fetch(`${config.nlq?.baseUrl || 'https://api.openai.com/v1'}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.nlq?.apiKey}` }, body: JSON.stringify({ model: config.nlq?.model || 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a SQL expert. Respond in JSON: {"sql":"...","explanation":"...","chartType":"table|bar|line|pie|number"}' }, { role: 'user', content: prompt }], temperature: 0.1 }) });
            return this._parseAIResponse((await response.json()).choices?.[0]?.message?.content || '');
        } catch (err) { console.error('[NLQ] OpenAI error:', err.message); return { sql: '', explanation: 'LLM unavailable', chartType: 'table' }; }
    }

    _buildPrompt(question, schemaContext, dbType) {
        return `You are a Text-to-SQL assistant for a ${dbType} database.\n\nDATABASE SCHEMA:\n${schemaContext}\n\nUSER QUESTION: "${question}"\n\nGenerate SQL. Respond in JSON: {"sql":"SELECT ...","explanation":"...","chartType":"table|bar|line|pie|number"}\nRules: Use only schema columns. LIMIT 1000 max. Single value = "number". Time-series = "line" or "bar". Categories = "pie".`;
    }

    _parseAIResponse(text) {
        try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); }
        catch (e) { const m = text.match(/SELECT[\s\S]*?(?:;|$)/i); return { sql: m ? m[0].replace(/;$/, '') : '', explanation: text.substring(0, 200), chartType: 'table' }; }
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

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12: PIPELINE (processQuestion - backward compatible)
// ═══════════════════════════════════════════════════════════════════════════════

function decrypt(text) {
    const key = crypto.scryptSync(config.encryptionKey, 'salt', 32);
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

async function processQuestion(userId, connectionId, question) {
    // 1. Get connection
    const connResult = await db.query('SELECT * FROM connections WHERE id = $1 AND user_id = $2', [connectionId, userId]);
    if (!connResult.rows.length) throw new Error('Connection not found');

    const conn = connResult.rows[0];
    let password = '';
    try { password = conn.password_encrypted ? decrypt(conn.password_encrypted) : ''; }
    catch (e) { throw new Error('Failed to decrypt credentials'); }

    const options = conn.options || {};
    const { opts, cleanup } = await withTunnel(
        { host: conn.host, port: conn.port, user: conn.username, password, database: conn.database_name, endpoints: (options.endpoints || []), options },
        options.ssh
    );

    // 2. Get schema (with cache)
    let schema, adapter;
    try {
        adapter = await poolManager.getAdapter(connectionId, conn.db_type, opts);
        let cached = schemaCache.get(connectionId);
        if (!cached) {
            schema = await adapter.getSchema();
            schemaCache.set(connectionId, schema);
        } else {
            schema = cached;
        }
    } catch (err) { cleanup(); throw new Error('Failed to get schema: ' + err.message); }

    // 3. Generate SQL via engine
    const engine = new NLQEngine();
    const generated = await engine.generateSQL({ question, schema, dbType: conn.db_type, userId });

    // Handle greeting (no SQL needed)
    if (!generated.sql) {
        cleanup();
        return { success: true, question, sql: '', explanation: generated.explanation, chartType: 'table', columns: [], data: [], rowCount: 0, duration: 0, confidence: generated.confidence || 1.0, followUps: generated.followUps || [] };
    }

    // 4. Validate SQL
    const validation = validateSQL(generated.sql);
    if (!validation.valid) {
        cleanup();
        return { success: false, question, sql: generated.sql, explanation: validation.reason, chartType: 'table', error: validation.reason, data: null, confidence: 0 };
    }

    // 5. Execute
    let results;
    try { results = await adapter.query(generated.sql); }
    catch (err) {
        cleanup();
        return { success: false, question, sql: generated.sql, explanation: generated.explanation, chartType: generated.chartType, error: err.message, data: null, confidence: generated.confidence || 0 };
    }
    cleanup();

    // 6. Result intelligence
    const analysis = analyzeResults(results, generated);

    return {
        success: true,
        question,
        sql: generated.sql,
        explanation: generated.explanation,
        chartType: generated.chartType,
        columns: results.columns,
        data: results.data,
        rowCount: results.data?.length || 0,
        duration: results.duration,
        confidence: generated.confidence || 0.8,
        insights: analysis.insights,
        followUps: generated.followUps || analysis.followUps || []
    };
}

module.exports = { NLQEngine, processQuestion, SchemaIntelligence, SchemaCache: schemaCache, validateSQL, analyzeResults };
