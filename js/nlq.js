/**
 * @file nlq.js
 * @description BI Copilot — Natural Language Query (Text-to-SQL) frontend module.
 * Provides a chat interface where business users ask questions in plain language,
 * the system translates to SQL, executes against connected DB, and displays results
 * with appropriate visualizations (table, chart, number).
 *
 * @module YDB.NLQ
 */

YDB.NLQ = {
    history: [],

    init: function () {
        var self = this;

        // Submit question
        document.getElementById('form-nlq').addEventListener('submit', function (e) {
            e.preventDefault();
            self.ask();
        });

        // Clear chat
        document.getElementById('btn-nlq-clear').addEventListener('click', function () {
            self.clearChat();
        });

        // Close results panel
        document.getElementById('btn-nlq-close-results').addEventListener('click', function () {
            document.getElementById('nlq-results-panel').style.display = 'none';
        });

        // Suggestion buttons
        document.querySelectorAll('.nlq-suggest').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.getElementById('nlq-input').value = this.dataset.q;
                self.ask();
            });
        });

        // Populate connections dropdown when tab becomes active
        this.populateConnections();
    },

    /**
     * Populate the connection selector dropdown
     */
    populateConnections: function () {
        var sel = document.getElementById('nlq-connection');
        var conns = YDB.State.connections || [];
        var opts = '<option value="">Select connection...</option>';
        conns.forEach(function (c) {
            opts += '<option value="' + c.id + '">' + c.name + ' (' + (c.type || c.db_type) + ')</option>';
        });
        sel.innerHTML = opts;

        // Auto-select active connection
        if (YDB.State.activeConnection) {
            sel.value = YDB.State.activeConnection.id;
        }
    },

    /**
     * Send a question to the BI Copilot
     */
    ask: function () {
        var input = document.getElementById('nlq-input');
        var question = input.value.trim();
        if (!question) return;

        var connectionId = document.getElementById('nlq-connection').value;
        if (!connectionId) {
            // Try active connection
            if (YDB.State.activeConnection) {
                connectionId = YDB.State.activeConnection.id;
                document.getElementById('nlq-connection').value = connectionId;
            } else {
                YDB.UI.toast('Sila pilih connection database terlebih dahulu', 'warning');
                return;
            }
        }

        // Add user message to chat
        this._addMessage('user', question);
        input.value = '';

        // Show loading
        var loadingId = this._addMessage('bot-loading', '');

        // Call API
        var self = this;
        YDB.API.post('/nlq/ask', { connectionId: parseInt(connectionId), question: question })
            .then(function (result) {
                self._removeMessage(loadingId);
                self._handleResult(result);
            })
            .catch(function (err) {
                self._removeMessage(loadingId);
                self._addMessage('bot-error', err.message || 'Maaf, gagal memproses soalan anda.');
            });
    },

    /**
     * Handle NLQ result — display SQL, explanation, and results
     */
    _handleResult: function (result) {
        var self = this;
        this.history.push(result);

        if (!result.success && result.error) {
            this._addMessage('bot-error', 'SQL Generated:\n' + (result.sql || 'None') + '\n\nError: ' + result.error);
            return;
        }

        // Build bot response HTML
        var html = '<div class="space-y-2">';

        // Explanation
        html += '<p class="text-sm">' + YDB.UI.esc(result.explanation) + '</p>';

        // SQL (collapsible)
        html += '<details class="collapse collapse-arrow bg-base-200 rounded">';
        html += '<summary class="collapse-title text-xs font-mono p-2 min-h-0">SQL Generated</summary>';
        html += '<div class="collapse-content p-2"><pre class="text-xs font-mono whitespace-pre-wrap text-primary">' + YDB.UI.esc(result.sql) + '</pre></div>';
        html += '</details>';

        // Quick stats
        html += '<div class="flex gap-2 text-xs text-base-content/60">';
        html += '<span>' + (result.rowCount || 0) + ' rows</span>';
        if (result.duration) html += '<span>• ' + result.duration + 'ms</span>';
        html += '<span>• ' + result.chartType + '</span>';
        html += '</div>';

        // Inline result preview
        if (result.chartType === 'number' && result.data && result.data.length) {
            var val = Object.values(result.data[0])[0];
            html += '<div class="stat bg-primary/10 rounded-lg p-3">';
            html += '<div class="stat-value text-primary text-2xl">' + self._formatNumber(val) + '</div>';
            html += '</div>';
        } else if (result.data && result.data.length) {
            // Show mini table (max 5 rows inline)
            html += self._buildMiniTable(result.columns, result.data.slice(0, 5));
            if (result.data.length > 5) {
                html += '<button class="btn btn-xs btn-ghost text-primary nlq-view-full" data-idx="' + (self.history.length - 1) + '">View all ' + result.rowCount + ' rows →</button>';
            }
        }

        html += '</div>';
        this._addMessage('bot', html);

        // Show chart in results panel if applicable
        if (result.chartType !== 'table' && result.chartType !== 'number' && result.data && result.data.length > 1) {
            this._showChart(result);
        }

        // Bind "view full" buttons
        setTimeout(function () {
            document.querySelectorAll('.nlq-view-full').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var idx = parseInt(this.dataset.idx);
                    self._showFullResults(self.history[idx]);
                });
            });
        }, 100);
    },

    /**
     * Show full results in the side panel
     */
    _showFullResults: function (result) {
        var panel = document.getElementById('nlq-results-panel');
        var content = document.getElementById('nlq-results-content');
        panel.style.display = 'flex';

        var html = '<div class="mb-3 text-xs text-base-content/60">' + result.rowCount + ' rows • ' + (result.duration || 0) + 'ms</div>';

        // Full table
        if (result.columns && result.data) {
            html += '<div class="overflow-x-auto"><table class="table table-xs table-zebra">';
            html += '<thead><tr>';
            result.columns.forEach(function (col) {
                var name = typeof col === 'string' ? col : col.name || col;
                html += '<th class="text-xs">' + name + '</th>';
            });
            html += '</tr></thead><tbody>';
            result.data.forEach(function (row) {
                html += '<tr>';
                result.columns.forEach(function (col) {
                    var key = typeof col === 'string' ? col : col.name || col;
                    var val = row[key];
                    html += '<td class="text-xs">' + (val !== null && val !== undefined ? val : '<span class="opacity-30">NULL</span>') + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table></div>';
        }

        content.innerHTML = html;
    },

    /**
     * Show chart visualization in the results panel
     */
    _showChart: function (result) {
        var panel = document.getElementById('nlq-results-panel');
        var content = document.getElementById('nlq-results-content');
        panel.style.display = 'flex';

        var cols = result.columns || [];
        var data = result.data || [];

        // Extract labels and values
        var labelKey = typeof cols[0] === 'string' ? cols[0] : cols[0]?.name;
        var valueKey = typeof cols[1] === 'string' ? cols[1] : cols[1]?.name;

        var labels = data.map(function (r) { return r[labelKey] || ''; });
        var values = data.map(function (r) { return parseFloat(r[valueKey]) || 0; });

        // Build chart using Chart.js (already loaded via CDN)
        var html = '<div class="mb-3"><canvas id="nlq-chart" height="250"></canvas></div>';
        html += '<div class="mt-3">';
        html += this._buildMiniTable(cols, data);
        html += '</div>';
        content.innerHTML = html;

        // Render chart
        if (window.Chart) {
            var ctx = document.getElementById('nlq-chart').getContext('2d');
            var chartType = result.chartType === 'pie' ? 'pie' : (result.chartType === 'line' ? 'line' : 'bar');

            new Chart(ctx, {
                type: chartType,
                data: {
                    labels: labels,
                    datasets: [{
                        label: valueKey || 'Value',
                        data: values,
                        backgroundColor: chartType === 'pie'
                            ? ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']
                            : 'rgba(79, 70, 229, 0.7)',
                        borderColor: 'rgba(79, 70, 229, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: chartType === 'pie' } },
                    scales: chartType === 'pie' ? {} : { y: { beginAtZero: true } }
                }
            });
        }
    },

    /**
     * Build a mini HTML table
     */
    _buildMiniTable: function (columns, data) {
        var html = '<div class="overflow-x-auto"><table class="table table-xs table-zebra">';
        html += '<thead><tr>';
        columns.forEach(function (col) {
            var name = typeof col === 'string' ? col : col.name || col;
            html += '<th class="text-xs">' + name + '</th>';
        });
        html += '</tr></thead><tbody>';
        data.forEach(function (row) {
            html += '<tr>';
            columns.forEach(function (col) {
                var key = typeof col === 'string' ? col : col.name || col;
                var val = row[key];
                html += '<td class="text-xs">' + (val !== null && val !== undefined ? val : '') + '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    },

    /**
     * Add a message to the chat
     */
    _addMessage: function (type, content) {
        var container = document.getElementById('nlq-messages');
        var id = 'nlq-msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        var div = document.createElement('div');
        div.id = id;

        if (type === 'user') {
            div.className = 'chat chat-end';
            div.innerHTML = '<div class="chat-bubble text-sm">' + YDB.UI.esc(content) + '</div>';
        } else if (type === 'bot-loading') {
            div.className = 'chat chat-start';
            div.innerHTML = '<div class="chat-bubble chat-bubble-primary text-sm"><span class="loading loading-dots loading-xs"></span> Memproses soalan anda...</div>';
        } else if (type === 'bot-error') {
            div.className = 'chat chat-start';
            div.innerHTML = '<div class="chat-bubble chat-bubble-error text-sm"><i data-lucide="alert-circle" class="w-3 h-3 inline"></i> ' + YDB.UI.esc(content) + '</div>';
        } else {
            // bot response (HTML)
            div.className = 'chat chat-start';
            div.innerHTML = '<div class="chat-bubble chat-bubble-primary text-sm max-w-lg">' + content + '</div>';
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        YDB.UI.icons();
        return id;
    },

    /**
     * Remove a message by ID
     */
    _removeMessage: function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
    },

    /**
     * Clear chat history
     */
    clearChat: function () {
        var container = document.getElementById('nlq-messages');
        container.innerHTML = '<div class="chat chat-start"><div class="chat-bubble chat-bubble-primary text-sm">' +
            '<p class="font-semibold mb-1">👋 Chat cleared!</p>' +
            '<p>Tanya soalan baru tentang data anda.</p></div></div>';
        this.history = [];
        document.getElementById('nlq-results-panel').style.display = 'none';
    },

    /**
     * Format large numbers with commas
     */
    _formatNumber: function (num) {
        if (num === null || num === undefined) return '0';
        var n = parseFloat(num);
        if (isNaN(n)) return String(num);
        if (Number.isInteger(n)) return n.toLocaleString();
        return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
};
