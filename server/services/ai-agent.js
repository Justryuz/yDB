/**
 * @file services/ai-agent.js
 * @description ReAct-style agentic loop for Text-to-SQL.
 *
 * Instead of a single generate→run→maybe-retry pass, the agent reasons in a
 * loop: it may inspect the schema, sample rows, run EXPLAIN, and execute
 * candidate SELECTs — observing each result — before committing to a final
 * answer. It also self-evaluates the result (empty / all-NULL / off-topic) and
 * keeps iterating until confident or a guardrail stops it.
 *
 *   Reason  → the model proposes the next tool call (JSON)
 *   Act     → we run that read-only tool
 *   Observe → the tool result is fed back into the transcript
 *   Reflect → repeat until final_answer or a guardrail trips
 *
 * Guardrails: max steps, wall-clock budget, read-only tool enforcement, and a
 * hard requirement that the final SQL passes validateSQL.
 *
 * Requires a configured LLM provider. Callers should fall back to the builtin
 * NLQ pipeline when aiProvider.isEnabled() is false.
 */

const aiProvider = require('./ai-provider');
const { validateSQL } = require('./nlq');
const { createTools } = require('./agent-tools');

const DEFAULT_MAX_STEPS = 6;
const DEFAULT_TIME_BUDGET_MS = 30 * 1000;

function buildSystemPrompt(dbType, toolSpecs) {
    const toolList = toolSpecs.map(t => {
        const args = Object.keys(t.args || {});
        return `- ${t.name}(${args.join(', ')}): ${t.description}`;
    }).join('\n');

    return `You are a ${dbType} data analyst agent. Answer the user's question by producing a correct read-only SELECT query.

You work in a loop. At EACH step respond with a SINGLE JSON object and nothing else:
  {"thought": "brief reasoning", "tool": "<tool_name>", "args": { ... }}

Available tools:
${toolList}

Rules:
- Use tools to understand the data before answering (inspect tables/columns, sample rows, test with run_query, check EXPLAIN if needed).
- Only SELECT queries are permitted. Never attempt to modify data.
- When you are confident, call the "final_answer" tool with the final "sql", a short business-friendly "explanation", and a "chartType" (one of: table, bar, line, pie, number).
- Prefer a query you have actually validated with run_query.
- Keep queries efficient and add LIMIT for record listings.
- Respond with ONLY the JSON object, no markdown, no prose outside it.`;
}

/**
 * Evaluate whether a run_query observation looks like a satisfactory answer.
 * Returns a hint the model can use to decide whether to keep iterating.
 */
function evaluateResult(obs) {
    if (!obs || obs.error) return { ok: false, note: 'The query errored.' };
    const rows = obs.rows || [];
    if (rows.length === 0) return { ok: false, note: 'The query returned 0 rows — the filter may be too strict or wrong.' };
    // All-NULL single cell (common for a mis-aggregated query).
    if (rows.length === 1) {
        const vals = Object.values(rows[0]);
        if (vals.length && vals.every(v => v === null)) {
            return { ok: false, note: 'The single result is NULL — the aggregation/column may be wrong.' };
        }
    }
    return { ok: true, note: 'Result looks reasonable.' };
}

/**
 * Run the agentic loop.
 * @param {object} params { question, adapter, schema, dbType, role, maxSteps, timeBudgetMs, onStep }
 *   onStep(step) — optional callback invoked with each trace step (for SSE streaming)
 * @returns {Promise<object>} { success, sql, explanation, chartType, columns, data, rowCount, steps, provider }
 */
async function run(params) {
    const {
        question, adapter, schema, dbType, role = 'viewer',
        maxSteps = DEFAULT_MAX_STEPS, timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
        onStep
    } = params;

    const { specs, dispatch } = createTools({ adapter, schema, dbType, role });
    const system = buildSystemPrompt(dbType, specs);
    const started = Date.now();
    const trace = [];

    // The running transcript the model sees each turn.
    let transcript = `USER QUESTION: "${question}"\n`;
    let lastRunObservation = null; // most recent run_query result (for final fallback)

    const emit = (step) => {
        trace.push(step);
        if (typeof onStep === 'function') {
            try { onStep(step); } catch (e) { /* ignore stream errors */ }
        }
    };

    for (let stepNo = 1; stepNo <= maxSteps; stepNo++) {
        if (Date.now() - started > timeBudgetMs) {
            emit({ type: 'guardrail', message: 'Time budget exceeded — stopping.' });
            break;
        }

        // ── Reason ──
        const prompt = `${system}\n\n${transcript}\nRespond with the next JSON action.`;
        let action;
        try {
            action = await aiProvider.completeJSON(prompt, { maxTokens: 700, temperature: 0.1, useCache: false });
        } catch (err) {
            emit({ type: 'error', message: 'Model error: ' + err.message });
            break;
        }

        if (!action || (!action.tool && !action._raw === false)) {
            // Could not parse a tool call.
            if (action && action._raw) {
                emit({ type: 'note', message: 'Model returned non-JSON; stopping.' });
            }
        }

        const tool = action && action.tool;
        const args = (action && action.args) || {};
        emit({ type: 'thought', step: stepNo, thought: (action && action.thought) || '', tool, args });

        if (!tool) {
            emit({ type: 'note', message: 'No tool selected; stopping.' });
            break;
        }

        // ── Final answer path ──
        if (tool === 'final_answer') {
            const check = validateSQL(args.sql || '');
            if (!check.valid) {
                // Reject unsafe/empty final answer; push feedback and continue.
                transcript += `\nASSISTANT proposed final SQL that was rejected: ${check.reason}\nRevise and try again.\n`;
                emit({ type: 'reject', message: check.reason });
                continue;
            }
            // Verify by executing once more (authoritative result).
            const obs = await dispatch('run_query', { sql: args.sql });
            emit({ type: 'final', sql: args.sql, explanation: args.explanation, chartType: args.chartType || 'table', observation: summarizeObs(obs) });

            if (obs.error) {
                transcript += `\nFinal SQL failed on execution: ${obs.error}\nFix it and call final_answer again.\n`;
                continue;
            }
            return {
                success: true,
                sql: args.sql,
                explanation: args.explanation || '',
                chartType: args.chartType || 'table',
                columns: obs.columns || [],
                data: obs.rows || [],
                rowCount: obs.rowCount || (obs.rows ? obs.rows.length : 0),
                steps: trace,
                provider: 'agent',
                confidence: 0.95
            };
        }

        // ── Act ──
        const observation = await dispatch(tool, args);
        if (tool === 'run_query') lastRunObservation = { sql: args.sql, ...observation };

        // ── Reflect (result-aware evaluation for query executions) ──
        let evalNote = '';
        if (tool === 'run_query') {
            const ev = evaluateResult(observation);
            evalNote = ' EVALUATION: ' + ev.note;
        }

        emit({ type: 'observation', step: stepNo, tool, observation: summarizeObs(observation), evaluation: evalNote.trim() || undefined });

        // ── Observe: feed back into transcript ──
        transcript += `\nSTEP ${stepNo}: ${tool}(${JSON.stringify(args)})\nOBSERVATION: ${JSON.stringify(summarizeObs(observation))}${evalNote}\n`;
    }

    // Guardrail/loop exhausted: fall back to the best query we actually ran.
    if (lastRunObservation && !lastRunObservation.error && (lastRunObservation.rows || []).length >= 0) {
        emit({ type: 'fallback', message: 'Returning the best validated query from the loop.' });
        return {
            success: true,
            sql: lastRunObservation.sql,
            explanation: 'Best query found during agent exploration.',
            chartType: 'table',
            columns: lastRunObservation.columns || [],
            data: lastRunObservation.rows || [],
            rowCount: lastRunObservation.rowCount || 0,
            steps: trace,
            provider: 'agent',
            confidence: 0.6
        };
    }

    return { success: false, error: 'Agent could not produce a valid answer within the step budget.', steps: trace, provider: 'agent' };
}

/** Compact an observation so transcripts/traces stay small. */
function summarizeObs(obs) {
    if (!obs) return obs;
    const copy = { ...obs };
    if (Array.isArray(copy.rows) && copy.rows.length > 5) {
        copy.rows = copy.rows.slice(0, 5);
        copy._note = 'rows truncated to 5 for context';
    }
    if (Array.isArray(copy.plan)) {
        copy.plan = JSON.stringify(copy.plan).slice(0, 800);
    }
    return copy;
}

module.exports = { run, evaluateResult, DEFAULT_MAX_STEPS };
