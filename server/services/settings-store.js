/**
 * @file services/settings-store.js
 * @description Small key/value store for application settings, persisted in the
 * app_settings table as JSONB. Used for AI provider configuration that admins
 * edit from the UI. Values are cached in memory (short TTL) so hot paths like
 * AI calls don't hit the DB every time.
 */

const db = require('../db/pool');

const cache = new Map(); // key -> { value, expires }
const TTL_MS = 30 * 1000;

/**
 * Read a settings value by key.
 * @param {string} key
 * @returns {Promise<object|null>}
 */
async function get(key) {
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;

    try {
        const result = await db.query('SELECT value FROM app_settings WHERE key = $1', [key]);
        const value = result.rows.length ? result.rows[0].value : null;
        cache.set(key, { value, expires: Date.now() + TTL_MS });
        return value;
    } catch (err) {
        // Table may not exist yet (pre-migration). Treat as "no settings".
        return null;
    }
}

/**
 * Upsert a settings value.
 * @param {string} key
 * @param {object} value
 * @returns {Promise<void>}
 */
async function set(key, value) {
    await db.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)]
    );
    cache.set(key, { value, expires: Date.now() + TTL_MS });
}

/** Clear the in-memory cache (e.g. after an external update). */
function invalidate(key) {
    if (key) cache.delete(key);
    else cache.clear();
}

module.exports = { get, set, invalidate };
