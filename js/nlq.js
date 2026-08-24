/**
 * @file nlq.js
 * @description Copilot — Natural Language Query (Text-to-SQL) frontend module.
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

        // Suggestion buttons (static ones — will be replaced by dynamic)
        document.querySelectorAll('.nlq-suggest').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.getElementById('nlq-input').value = this.dataset.q;
                self.ask();
            });
        });

        // Refresh connections when tab becomes visible
        var copilotTab = document.querySelector('[data-tab="copilot"]');
        if (copilotTab) {
            copilotTab.addEventListener('click', function () {
                self.populateConnections();
            });
        }

        // Load dynamic suggestions when connection changes
        document.getElementById('nlq-connection').addEventListener('change', function () {
            if (this.value) {
                self.loadSuggestions(this.value);
            }
        });

        this.populateConnections();
    },

    /**
     * Populate the connection selector dropdown.
     * Fetches from API if state is empty.
     */
    populateConnections: function () {
        var sel = document.getElementById('nlq-connection');
        var self = this;

        function renderOptions(conns) {
            var opts = '<option value="">Select connection...</option>';
            conns.forEach(function (c) {
                var dbType = c.type || c.db_type || '';
                var label = c.name + (dbType ? ' (' + dbType + ')' : '');
                opts += '<option value="' + c.id + '">' + label + '</option>';
            });
            sel.innerHTML = opts;

            // Auto-select active connection
            if (YDB.State.activeConnection) {
                sel.value = YDB.State.activeConnection.id;
                self.loadSuggestions(YDB.State.activeConnection.id);
            } else if (conns.length === 1) {
                sel.value = conns[0].id;
                self.loadSuggestions(conns[0].id);
            }
        }

        // Use state if available
        if (YDB.State.connections && YDB.State.connections.length > 0) {
            renderOptions(YDB.State.connections);
        } else if (YDB.API.isOnline() && YDB.API.token) {
            // Fetch from API
            YDB.API.get('/connections').then(function (conns) {
                YDB.State.connections = conns.map(function (c) {
                    return { id: c.id, name: c.name, type: c.db_type, host: c.host, port: c.port, username: c.username, database: c.database_name };
                });
                renderOptions(YDB.State.connections);
            }).catch(function () {});
        }
    },

    /**
     * Load dynamic suggestions based on actual database schema.
     * Calls POST /api/nlq/suggest and renders smart suggestion chips.
     */
    loadSuggestions: function (connectionId) {
        var self = this;
        var container = document.getElementById('nlq-suggestions');

        container.innerHTML = '<div class="flex items-center gap-2 text-xs text-base-content/50"><span class="loading loading-spinner loading-xs"></span> Analyzing schema...</div>';

        YDB.API.post('/nlq/suggest', { connectionId: parseInt(connectionId) })
            .then(function (data) {
                var suggestions = data.suggestions || [];
                var categories = data.categories || [];

                if (!suggestions.length) {
                    container.innerHTML = '<div class="text-xs text-base-content/50">No suggestions available</div>';
                    return;
                }

                var html = '';

                // Group by category with icons
                var grouped = {};
                suggestions.forEach(function (s) {
                    var cat = s.category || 'general';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(s);
                });

                // Render category tabs + suggestion chips
                var catIcons = { count: '#', sum: '$', trend: '^', breakdown: '/', ranking: '*', recent: '~' };

                html += '<div class="flex gap-1 flex-wrap">';
                for (var cat in grouped) {
                    grouped[cat].forEach(function (s) {
                        html += '<button class="btn btn-xs btn-outline nlq-suggest-dynamic" data-q="' + self._escAttr(s.q) + '" title="' + (s.table || '') + '">';
                        html += self._truncate(s.q, 35);
                        html += '</button>';
                    });
                }
                html += '</div>';

                container.innerHTML = html;

                // Bind click handlers
                container.querySelectorAll('.nlq-suggest-dynamic').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        document.getElementById('nlq-input').value = this.dataset.q;
                        self.ask();
                    });
                });
            })
            .catch(function () {
                container.innerHTML = '<div class="flex gap-2 flex-wrap"><button class="btn btn-xs btn-outline nlq-suggest" data-q="How many records?">Count records</button><button class="btn btn-xs btn-outline nlq-suggest" data-q="Show latest 20 records">Latest</button></div>';
            });
    },

    /**
     * Escape HTML attribute value
     */
    _escAttr: function (str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    /**
     * Truncate string with ellipsis
     */
    _truncate: function (str, max) {
        return str.length > max ? str.substring(0, max) + '...' : str;
    },

    /**
     * Send a question to the Copilot
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
                YDB.UI.toast('Please select a database connection first', 'warning');
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
        html += '<p class="text-sm font-medium text-base-content">' + YDB.UI.esc(result.explanation) + '</p>';

        // SQL (collapsible)
        html += '<details class="rounded border border-base-300 bg-base-300/30">';
        html += '<summary class="text-xs font-mono p-2 cursor-pointer text-base-content/80">SQL Generated</summary>';
        html += '<div class="p-2 border-t border-base-300"><pre class="text-xs font-mono whitespace-pre-wrap text-success">' + YDB.UI.esc(result.sql) + '</pre></div>';
        html += '</details>';

        // Quick stats
        html += '<div class="flex gap-2 text-xs text-base-content/70">';
        html += '<span>' + (result.rowCount || 0) + ' rows</span>';
        if (result.duration) html += '<span>• ' + result.duration + 'ms</span>';
        html += '<span>• ' + result.chartType + '</span>';
        html += '</div>';

        // Inline result preview
        if (result.chartType === 'number' && result.data && result.data.length) {
            var val = Object.values(result.data[0])[0];
            html += '<div class="bg-base-300/50 rounded-lg p-3 text-center">';
            html += '<div class="text-2xl font-bold text-primary">' + self._formatNumber(val) + '</div>';
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
        var html = '<div class="overflow-x-auto rounded border border-base-300"><table class="table table-xs">';
        html += '<thead><tr class="bg-base-300/50">';
        columns.forEach(function (col) {
            var name = typeof col === 'string' ? col : col.name || col;
            html += '<th class="text-xs text-base-content/80 font-semibold">' + name + '</th>';
        });
        html += '</tr></thead><tbody>';
        data.forEach(function (row, i) {
            html += '<tr class="' + (i % 2 === 0 ? '' : 'bg-base-300/20') + '">';
            columns.forEach(function (col) {
                var key = typeof col === 'string' ? col : col.name || col;
                var val = row[key];
                html += '<td class="text-xs text-base-content">' + (val !== null && val !== undefined ? val : '<span class="opacity-40">NULL</span>') + '</td>';
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
            div.innerHTML = '<div class="chat-bubble bg-primary text-primary-content text-sm">' + YDB.UI.esc(content) + '</div>';
        } else if (type === 'bot-loading') {
            div.className = 'chat chat-start';
            div.innerHTML = '<div class="chat-bubble bg-base-200 text-base-content text-sm"><span class="loading loading-dots loading-xs"></span> Analyzing your question...</div>';
        } else if (type === 'bot-error') {
            div.className = 'chat chat-start';
            div.innerHTML = '<div class="chat-bubble bg-error/10 text-error text-sm"><i data-lucide="alert-circle" class="w-3 h-3 inline"></i> ' + YDB.UI.esc(content) + '</div>';
        } else {
            // bot response (HTML)
            div.className = 'chat chat-start';
            div.innerHTML = '<div class="chat-bubble bg-base-200 text-base-content text-sm max-w-lg">' + content + '</div>';
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
        container.innerHTML = '<div class="chat chat-start"><div class="chat-bubble bg-base-200 text-base-content text-sm">' +
            '<p class="font-semibold mb-1">👋 Chat cleared!</p>' +
            '<p>Ask a new question about your data.</p></div></div>';
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
