/**
 * @file services/ai-cache.js
 * @description In-memory LRU+TTL cache for LLM responses.
 *
 * Identical prompts against the same provider/model return the cached result,
 * cutting cost and latency for repeated questions (e.g. the same NLQ asked
 * twice, or re-running "explain this query"). Deterministic prompts only —
 * we call with temperature ~0 so caching is safe.
 */

const crypto = require('crypto');

const MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Map preserves insertion order, which we use for cheap LRU eviction.
const store = new Map(); // key -> { value, expires }
let hits = 0;
let misses = 0;

/** Build a stable cache key from the request shape. */
function keyFor({ provider, model, prompt, kind }) {
    const h = crypto.createHash('sha256');
    h.update(String(kind || 'complete'));
    h.update('\x00');
    h.update(String(provider || ''));
    h.update('\x00');
    h.update(String(model || ''));
    h.update('\x00');
    h.update(String(prompt || ''));
    return h.digest('hex');
}

/**
 * @param {object} id { provider, model, prompt, kind }
 * @returns {*} cached value or undefined
 */
function get(id) {
    const key = keyFor(id);
    const entry = store.get(key);
    if (!entry) { misses++; return undefined; }
    if (entry.expires <= Date.now()) {
        store.delete(key);
        misses++;
        return undefined;
    }
    // Refresh LRU position.
    store.delete(key);
    store.set(key, entry);
    hits++;
    return entry.value;
}

/**
 * @param {object} id { provider, model, prompt, kind }
 * @param {*} value
 * @param {number} [ttlMs]
 */
function set(id, value, ttlMs = DEFAULT_TTL_MS) {
    const key = keyFor(id);
    if (store.has(key)) store.delete(key);
    store.set(key, { value, expires: Date.now() + ttlMs });
    // Evict oldest if over capacity.
    while (store.size > MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
    }
}

function clear() { store.clear(); hits = 0; misses = 0; }

function stats() {
    return { size: store.size, hits, misses, maxEntries: MAX_ENTRIES };
}

module.exports = { get, set, clear, stats, keyFor };
