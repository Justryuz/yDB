/**
 * @file ai-settings.js
 * @description Admin AI provider settings — pick provider/model, set API keys,
 * test the connection. Talks to /api/settings/ai.
 * @module YDB.AISettings
 */

YDB.AISettings = {
    presets: {},
    defaults: {},

    init: function () {
        var self = this;
        var save = document.getElementById('btn-ai-save');
        var test = document.getElementById('btn-ai-test');
        var provider = document.getElementById('ai-provider');
        if (save) save.addEventListener('click', function () { self.save(); });
        if (test) test.addEventListener('click', function () { self.test(); });
        if (provider) provider.addEventListener('change', function () { self._onProviderChange(this.value); });
    },

    /** Load current settings and populate the form. */
    load: function () {
        var self = this;
        YDB.API.get('/settings/ai').then(function (data) {
            self.presets = data.modelPresets || {};
            self.defaults = data.defaultModels || {};

            // Providers dropdown
            var sel = document.getElementById('ai-provider');
            sel.innerHTML = '';
            (data.providers || ['builtin']).forEach(function (p) {
                var opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
                if (p === data.provider) opt.selected = true;
                sel.appendChild(opt);
            });

            document.getElementById('ai-model').value = data.model || '';
            document.getElementById('ai-region').value = data.region || '';
            document.getElementById('ai-baseurl').value = data.baseUrl || '';
            document.getElementById('ai-apikey').value = '';
            document.getElementById('ai-apikey-hint').textContent = data.apiKeySet
                ? 'A key is set (' + (data.apiKeyHint || '••••') + '). Leave blank to keep it.'
                : 'No key set.';

            if (data.cache) {
                document.getElementById('ai-cache-stats').textContent =
                    'Response cache: ' + data.cache.size + ' entries · ' + data.cache.hits + ' hits · ' + data.cache.misses + ' misses';
            }

            self._onProviderChange(data.provider);
        }).catch(function (err) {
            YDB.UI.toast('Failed to load AI settings: ' + err.message, 'error');
        });
    },

    /** Show/hide provider-specific fields and refresh the model preset list. */
    _onProviderChange: function (provider) {
        var isBedrock = provider === 'bedrock';
        var isOpenAI = provider === 'openai';
        var needsKey = provider === 'openai' || provider === 'anthropic' || provider === 'gemini';

        document.getElementById('ai-region-wrap').style.display = isBedrock ? 'block' : 'none';
        document.getElementById('ai-baseurl-wrap').style.display = isOpenAI ? 'block' : 'none';
        document.getElementById('ai-apikey-wrap').style.display = needsKey ? 'block' : 'none';
        document.getElementById('ai-bedrock-token-wrap').style.display = isBedrock ? 'block' : 'none';

        // Update model preset datalist + placeholder.
        var dl = document.getElementById('ai-model-presets');
        dl.innerHTML = '';
        (this.presets[provider] || []).forEach(function (m) {
            var opt = document.createElement('option');
            opt.value = m;
            dl.appendChild(opt);
        });
        var modelInput = document.getElementById('ai-model');
        modelInput.placeholder = this.defaults[provider] ? '(default: ' + this.defaults[provider] + ')' : '(provider default)';
    },

    save: function () {
        var body = {
            provider: document.getElementById('ai-provider').value,
            model: document.getElementById('ai-model').value.trim(),
            region: document.getElementById('ai-region').value.trim(),
            baseUrl: document.getElementById('ai-baseurl').value.trim()
        };
        var apiKey = document.getElementById('ai-apikey').value.trim();
        var token = document.getElementById('ai-bedrock-token').value.trim();
        if (apiKey) body.apiKey = apiKey;
        if (token) body.bedrockBearerToken = token;

        YDB.API.put('/settings/ai', body).then(function () {
            YDB.UI.toast('AI settings saved', 'success');
            YDB.AISettings.load();
        }).catch(function (err) {
            YDB.UI.toast('Save failed: ' + err.message, 'error');
        });
    },

    test: function () {
        var el = document.getElementById('ai-test-result');
        el.textContent = 'Testing…';
        el.className = 'text-xs text-base-content/60';
        YDB.API.post('/settings/ai/test', {}).then(function (data) {
            el.textContent = data.ok ? '✓ ' + (data.message || 'OK') : '✗ ' + (data.message || 'Failed');
            el.className = 'text-xs ' + (data.ok ? 'text-success' : 'text-error');
        }).catch(function (err) {
            el.textContent = '✗ ' + err.message;
            el.className = 'text-xs text-error';
        });
    }
};
