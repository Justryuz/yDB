/**
 * @file services/ai-provider.js
 * @description Single entry point for every LLM call in yDB.
 *
 * Previously the Bedrock/OpenAI request logic was duplicated across nlq.js and
 * sql-assistant.js with inconsistent default models. This module centralises it
 * and adds Anthropic (direct) and Google Gemini providers.
 *
 * Configuration precedence (highest first):
 *   1. Settings saved in the DB (app_settings, key 'ai') — editable from the UI
 *   2. Environment variables (config.nlq.*)
 *
 * Public API:
 *   getSettings()                     -> resolved { provider, model, ... }
 *   isEnabled()                       -> boolean (a real LLM provider configured)
 *   complete(prompt, opts)            -> Promise<string>  (raw model text)
 *   completeJSON(prompt, opts)        -> Promise<object>  (parsed JSON, best-effort)
 *   PROVIDERS / MODEL_PRESETS         -> metadata for the settings UI
 */

const config = require('../config');
const settingsStore = require('./settings-store');
const aiCache = require('./ai-cache');

// ── Provider metadata (for the settings UI) ──────────────────────────────────
const PROVIDERS = ['builtin', 'bedrock', 'openai', 'anthropic', 'gemini'];

// Sensible current defaults per provider (Sept 2026). All overridable.
const DEFAULT_MODEL = {
    bedrock: 'amazon.nova-lite-v1:0',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-haiku-4-5',
    gemini: 'gemini-flash-latest'
};

// Suggested models shown in the UI dropdown (users can also type their own).
const MODEL_PRESETS = {
    bedrock: [
        'amazon.nova-lite-v1:0',
        'amazon.nova-pro-v1:0',
        'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        'anthropic.claude-3-5-haiku-20241022-v1:0'
    ],
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-5-mini', 'gpt-5-nano'],
    anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku-latest'],
    gemini: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-pro']
};

/**
 * Resolve effective AI settings, merging DB settings over env config.
 * @returns {Promise<object>}
 */
async function getSettings() {
    const saved = (await settingsStore.get('ai')) || {};
    const provider = saved.provider || config.nlq?.provider || 'builtin';
    return {
        provider,
        model: saved.model || config.nlq?.model || DEFAULT_MODEL[provider] || '',
        region: saved.region || config.nlq?.region || 'us-east-1',
        baseUrl: saved.baseUrl || config.nlq?.baseUrl || '',
        // API keys: prefer DB, then env. Never returned to the client (see routes).
        apiKey: saved.apiKey || config.nlq?.apiKey || '',
        bedrockBearerToken: saved.bedrockBearerToken || process.env.AWS_BEARER_TOKEN_BEDROCK || ''
    };
}

/** True when a non-builtin provider is configured with the credentials it needs. */
async function isEnabled() {
    const s = await getSettings();
    if (s.provider === 'builtin' || !s.provider) return false;
    if (s.provider === 'bedrock') return true; // may use IAM creds without an explicit key
    if (s.provider === 'openai' || s.provider === 'anthropic' || s.provider === 'gemini') {
        return !!s.apiKey;
    }
    return false;
}

/**
 * Get a raw text completion from the configured provider.
 * @param {string} prompt
 * @param {object} [opts] { maxTokens=1024, temperature=0.1, signal }
 * @returns {Promise<string>}
 */
async function complete(prompt, opts = {}) {
    const s = await getSettings();
    const maxTokens = opts.maxTokens || 1024;
    const temperature = opts.temperature ?? 0.1;
    const useCache = opts.useCache !== false && !opts.signal; // don't cache streamed/abortable calls

    // Cache lookup (deterministic prompts only).
    const cacheId = { provider: s.provider, model: s.model, prompt, kind: 'complete' };
    if (useCache) {
        const cached = aiCache.get(cacheId);
        if (cached !== undefined) return cached;
    }

    let text;
    switch (s.provider) {
        case 'bedrock': text = await callBedrock(prompt, s, { maxTokens, temperature, signal: opts.signal }); break;
        case 'openai': text = await callOpenAI(prompt, s, { maxTokens, temperature, signal: opts.signal }); break;
        case 'anthropic': text = await callAnthropic(prompt, s, { maxTokens, temperature, signal: opts.signal }); break;
        case 'gemini': text = await callGemini(prompt, s, { maxTokens, temperature, signal: opts.signal }); break;
        default:
            throw new Error('No AI provider configured');
    }

    if (useCache && text) aiCache.set(cacheId, text);
    return text;
}

/**
 * Completion that parses a JSON object out of the model output.
 * Tolerates ```json fences and leading/trailing prose.
 * @returns {Promise<object>}
 */
async function completeJSON(prompt, opts = {}) {
    const text = await complete(prompt, opts);
    return parseJSON(text);
}

function parseJSON(text) {
    if (!text) return {};
    const clean = String(text).replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    try {
        return JSON.parse(clean);
    } catch (e) {
        // Try to extract the first {...} block.
        const m = clean.match(/\{[\s\S]*\}/);
        if (m) {
            try { return JSON.parse(m[0]); } catch (e2) { /* fall through */ }
        }
        return { _raw: clean };
    }
}

// ── Provider implementations ──────────────────────────────────────────────────

async function callBedrock(prompt, s, { maxTokens, temperature, signal }) {
    const region = s.region || 'us-east-1';
    const model = s.model || DEFAULT_MODEL.bedrock;
    const isClaude = model.includes('claude') || model.includes('anthropic');

    const buildBody = () => isClaude
        ? JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: maxTokens, temperature, messages: [{ role: 'user', content: prompt }] })
        : JSON.stringify({ messages: [{ role: 'user', content: [{ text: prompt }] }], inferenceConfig: { maxTokens, temperature } });

    const extractText = (data) =>
        data.content?.[0]?.text
        || data.output?.message?.content?.[0]?.text
        || data.results?.[0]?.outputText
        || '';

    if (s.bedrockBearerToken) {
        const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/invoke`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${s.bedrockBearerToken}`,
                'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD'
            },
            body: buildBody(),
            signal
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Bedrock ${response.status}: ${errText.substring(0, 200)}`);
        }
        return extractText(await response.json());
    }

    // Fall back to AWS SDK (IAM credentials from the environment / instance role).
    const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
    const client = new BedrockRuntimeClient({ region });
    const command = new InvokeModelCommand({
        modelId: model,
        contentType: 'application/json',
        accept: 'application/json',
        body: buildBody()
    });
    const response = await client.send(command);
    return extractText(JSON.parse(new TextDecoder().decode(response.body)));
}

async function callOpenAI(prompt, s, { maxTokens, temperature, signal }) {
    if (!s.apiKey) throw new Error('OpenAI API key not configured');
    const baseUrl = s.baseUrl || 'https://api.openai.com/v1';
    const model = s.model || DEFAULT_MODEL.openai;
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_completion_tokens: maxTokens
        }),
        signal
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'OpenAI API error');
    return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(prompt, s, { maxTokens, temperature, signal }) {
    if (!s.apiKey) throw new Error('Anthropic API key not configured');
    const model = s.model || DEFAULT_MODEL.anthropic;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': s.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature,
            messages: [{ role: 'user', content: prompt }]
        }),
        signal
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'Anthropic API error');
    return data.content?.[0]?.text || '';
}

async function callGemini(prompt, s, { maxTokens, temperature, signal }) {
    if (!s.apiKey) throw new Error('Gemini API key not configured');
    const model = s.model || DEFAULT_MODEL.gemini;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(s.apiKey)}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens }
        }),
        signal
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'Gemini API error');
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = {
    getSettings,
    isEnabled,
    complete,
    completeJSON,
    parseJSON,
    cacheStats: aiCache.stats,
    clearCache: aiCache.clear,
    PROVIDERS,
    MODEL_PRESETS,
    DEFAULT_MODEL
};
