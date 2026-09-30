/**
 * @file routes/settings.js
 * @description Admin settings API. Currently exposes AI provider configuration
 * (provider, model, region, API keys) stored in app_settings.
 *
 * Security: API keys are never returned in full. Reads return a masked hint and
 * a boolean indicating whether a key is set. Writes accept a new key or leave
 * the existing one untouched when the field is omitted / blank.
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const settingsStore = require('../services/settings-store');
const aiProvider = require('../services/ai-provider');
const { logFromRequest } = require('../services/audit-log');

router.use(authenticate);

/** Mask a secret for display: show only the last 4 chars. */
function maskKey(key) {
    if (!key) return '';
    const s = String(key);
    if (s.length <= 4) return '••••';
    return '••••••••' + s.slice(-4);
}

/**
 * GET /api/settings/ai
 * Returns the current AI settings with secrets masked, plus available
 * providers and model presets for the UI. Admin only.
 */
router.get('/ai', authorize('admin'), async (req, res) => {
    try {
        const saved = (await settingsStore.get('ai')) || {};
        const resolved = await aiProvider.getSettings();
        res.json({
            provider: resolved.provider,
            model: resolved.model,
            region: resolved.region,
            baseUrl: resolved.baseUrl,
            // Never expose the full keys.
            apiKeySet: !!saved.apiKey,
            apiKeyHint: maskKey(saved.apiKey),
            bedrockTokenSet: !!saved.bedrockBearerToken,
            providers: aiProvider.PROVIDERS,
            modelPresets: aiProvider.MODEL_PRESETS,
            defaultModels: aiProvider.DEFAULT_MODEL,
            cache: aiProvider.cacheStats()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/settings/ai
 * Body: { provider, model, region, baseUrl, apiKey?, bedrockBearerToken? }
 * Secrets are only updated when a non-empty value is supplied. Admin only.
 */
router.put('/ai', authorize('admin'), async (req, res) => {
    try {
        const { provider, model, region, baseUrl, apiKey, bedrockBearerToken } = req.body || {};

        if (provider && !aiProvider.PROVIDERS.includes(provider)) {
            return res.status(400).json({ error: `Invalid provider. Allowed: ${aiProvider.PROVIDERS.join(', ')}` });
        }

        const current = (await settingsStore.get('ai')) || {};
        const next = {
            provider: provider || current.provider || 'builtin',
            model: model !== undefined ? model : (current.model || ''),
            region: region !== undefined ? region : (current.region || ''),
            baseUrl: baseUrl !== undefined ? baseUrl : (current.baseUrl || ''),
            // Preserve existing secrets unless a new non-empty value is given.
            apiKey: (apiKey && apiKey.trim()) ? apiKey.trim() : (current.apiKey || ''),
            bedrockBearerToken: (bedrockBearerToken && bedrockBearerToken.trim()) ? bedrockBearerToken.trim() : (current.bedrockBearerToken || '')
        };

        await settingsStore.set('ai', next);

        await logFromRequest(req, 'settings.ai_updated', 'settings', {
            status: 'success',
            details: { provider: next.provider, model: next.model, region: next.region }
        });

        res.json({ success: true, provider: next.provider, model: next.model });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/settings/ai/test
 * Runs a tiny prompt through the configured provider to verify credentials.
 * Admin only.
 */
router.post('/ai/test', authorize('admin'), async (req, res) => {
    try {
        if (!(await aiProvider.isEnabled())) {
            return res.json({ ok: false, message: 'No AI provider configured (currently using the builtin engine).' });
        }
        const text = await aiProvider.complete('Reply with the single word: OK', { maxTokens: 8, useCache: false });
        res.json({ ok: true, message: 'AI provider responded.', sample: (text || '').slice(0, 80) });
    } catch (err) {
        res.json({ ok: false, message: err.message });
    }
});

module.exports = router;
