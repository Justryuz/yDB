/**
 * YDB - Visual Query Builder
 */
YDB.Builder = {
    init: function () {
        var self = this;
        document.getElementById('btn-generate-run').addEventListener('click', function () { self.generateAndRun(); });
        document.getElementById('btn-ai-suggest-join').addEventListener('click', function () { self.aiSuggestJoin(); });
        document.getElementById('btn-clear-canvas').addEventListener('click', function () { self.clearCanvas(); });
        document.getElementById('btn-zoom-in').addEventListener('click', function () { self.zoom(YDB.Config.ZOOM_STEP); });
        document.getElementById('btn-zoom-out').addEventListener('click', function () { self.zoom(-YDB.Config.ZOOM_STEP); });
        document.getElementById('btn-zoom-reset').addEventListener('click', function () { self.setZoom(1); });
        document.getElementById('btn-save-as-db').addEventListener('click', function () { self.openSaveModal(); });
        document.getElementById('btn-confirm-save-db').addEventListener('click', function () { self.confirmSaveAsDb(); });
        document.getElementById('btn-cancel-save-db').addEventListener('click', function () { document.getElementById('modal-save-db').close(); });
        document.getElementById('btn-copy-sql').addEventListener('click', function () {
            var sql = document.getElementById('generated-sql').textContent;
            navigator.clipboard.writeText(sql).then(function () { YDB.UI.toast('SQL copied!', 'success'); });
        });

        // Export buttons
        document.querySelectorAll('[data-bexport]').forEach(function (btn) {
            btn.addEventListener('click', function () { YDB.Export.fromContainer('builder-results', this.dataset.bexport, 'builder_result'); });
        });

        // Canvas drop
        var wrapper = document.getElementById('canvas-wrapper');
        wrapper.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        wrapper.addEventListener('drop', function (e) { e.preventDefault(); self._onDrop(e); });
        wrapper.addEventListener('wheel', function (e) { if (e.ctrlKey) { e.preventDefault(); self.zoom(e.deltaY < 0 ? 0.1 : -0.1); } });
    },

    // === Tables List ===
    renderTablesList: function () {
        var el = document.getElementById('builder-tables-list');
        var conns = YDB.State.connections.filter(function (c) { return YDB.MockData.schemas[c.id]; });
        if (!conns.length) {
            // No cached schemas yet — show message
            if (YDB.State.connections.length) {
                el.innerHTML = '<p class="text-base-content/50 text-xs">Click a connection in sidebar first to load its schema</p>';
            } else {
                el.innerHTML = '<p class="text-base-content/50 text-xs">No connections available</p>';
            }
            return;
        }

        el.innerHTML = conns.map(function (conn) {
            var db = YDB.Config.DB_TYPES[conn.type] || { name: conn.type, color: '#666' };
            var schema = YDB.MockData.schemas[conn.id];
            var tables = Object.keys(schema.tables).map(function (tn) {
                return '<div class="drag-table" draggable="true" data-tbl="' + tn + '" data-cid="' + conn.id + '">'
                    + '<i data-lucide="table-2" class="w-3 h-3" style="color:' + db.color + '"></i><span>' + tn + '</span></div>';
            }).join('');
            return '<div class="mb-3"><div class="flex items-center gap-2 mb-1 px-1">'
                + '<div class="w-2 h-2 rounded-full" style="background:' + db.color + '"></div>'
                + '<span class="text-xs font-semibold text-base-content/70">' + conn.name + '</span>'
                + '<span class="badge badge-xs">' + db.name + '</span></div>' + tables + '</div>';
        }).join('');
        YDB.UI.icons();

        // Drag events
        el.querySelectorAll('.drag-table').forEach(function (d) {
            d.addEventListener('dragstart', function (e) {
                e.dataTransfer.setData('text/plain', JSON.stringify({ table: this.dataset.tbl, connId: this.dataset.cid }));
            });
        });
    },

    // === Canvas Drop ===
    _onDrop: function (e) {
        var raw = e.dataTransfer.getData('text/plain'); if (!raw) return;
        var info; try { info = JSON.parse(raw); } catch (x) { return; }
        var S = YDB.State;
        if (S.canvasTables.find(function (t) { return t.name === info.table && t.connId === info.connId; })) {
            YDB.UI.toast(info.table + ' already on canvas', 'warning'); return;
        }
        var wrapper = document.getElementById('canvas-wrapper');
        var rect = wrapper.getBoundingClientRect();
        var x = (e.clientX - rect.left) / S.canvasZoom - 90;
        var y = (e.clientY - rect.top) / S.canvasZoom - 20;
        this._addTable(info.table, info.connId, x, y);
    },

    _addTable: function (name, connId, x, y) {
        var schema = YDB.MockData.schemas[connId]; if (!schema || !schema.tables[name]) return;
        var conn = YDB.State.connections.find(function (c) { return c.id === connId; });
        var db = YDB.Config.DB_TYPES[conn ? conn.type : ''] || { name: '?', color: '#666' };
        var ct = {
            id: YDB.State.canvasNextId++, name: name, connId: connId,
            connName: conn ? conn.name : '?', connType: conn ? conn.type : '',
            dbName: schema.name, color: db.color,
            x: Math.max(0, x), y: Math.max(0, y), selectedColumns: []
        };
        YDB.State.canvasTables.push(ct);
        document.getElementById('canvas-placeholder').style.display = 'none';
        this._renderCanvas();

        // Auto-suggest join
        if (YDB.State.canvasTables.length > 1) this._autoSuggest(ct);
    },

    // === Render Canvas ===
    _renderCanvas: function () {
        var canvas = document.getElementById('query-canvas');
        canvas.querySelectorAll('.canvas-table,.join-line-svg').forEach(function (el) { el.remove(); });
        var self = this;

        YDB.State.canvasTables.forEach(function (ct) {
            var schema = YDB.MockData.schemas[ct.connId]; if (!schema) return;
            var table = schema.tables[ct.name]; if (!table) return;

            var el = document.createElement('div');
            el.className = 'canvas-table'; el.style.left = ct.x + 'px'; el.style.top = ct.y + 'px';
            el.dataset.cid = ct.id;

            var h = '<div class="canvas-table-header" style="background:' + ct.color + '">'
                + '<div><div class="sub">' + ct.connName + '</div><span>' + ct.name + '</span></div>'
                + '<button class="btn btn-ghost btn-xs text-white/80" data-rmtable="' + ct.id + '">&times;</button></div>';
            h += '<div class="canvas-table-cols">';
            table.columns.forEach(function (col) {
                var chk = ct.selectedColumns.indexOf(col.name) >= 0 ? ' checked' : '';
                h += '<label class="canvas-col"><input type="checkbox" class="checkbox checkbox-xs checkbox-primary"' + chk + ' data-tid="' + ct.id + '" data-col="' + col.name + '">'
                    + '<span>' + col.name + '</span><span class="ctype">' + col.type + '</span></label>';
            });
            h += '</div>';
            el.innerHTML = h;
            canvas.appendChild(el);

            // Drag to move
            self._makeDraggable(el, ct);

            // Checkbox events
            el.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
                cb.addEventListener('change', function () {
                    var tid = parseInt(this.dataset.tid), col = this.dataset.col;
                    var t = YDB.State.canvasTables.find(function (x) { return x.id === tid; });
                    if (!t) return;
                    if (this.checked) t.selectedColumns.push(col);
                    else t.selectedColumns = t.selectedColumns.filter(function (c) { return c !== col; });
                    self._updateSQL();
                    self._autoRerun();
                });
            });

            // Remove button
            el.querySelector('[data-rmtable]').addEventListener('click', function () {
                var id = parseInt(this.dataset.rmtable);
                YDB.State.canvasTables = YDB.State.canvasTables.filter(function (t) { return t.id !== id; });
                YDB.State.canvasJoins = YDB.State.canvasJoins.filter(function (j) { return j.leftId !== id && j.rightId !== id; });
                if (!YDB.State.canvasTables.length) document.getElementById('canvas-placeholder').style.display = '';
                self._renderCanvas();
            });
        });
        this._updateSQL();
    },

    _makeDraggable: function (el, ct) {
        var dragging = false, sx, sy, ox, oy;
        var header = el.querySelector('.canvas-table-header');

        function onMove(e) {
            if (!dragging) return;
            ct.x = Math.max(0, ox + (e.clientX - sx) / YDB.State.canvasZoom);
            ct.y = Math.max(0, oy + (e.clientY - sy) / YDB.State.canvasZoom);
            el.style.left = ct.x + 'px'; el.style.top = ct.y + 'px';
        }
        function onUp() {
            if (!dragging) return;
            dragging = false; el.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }

        header.addEventListener('mousedown', function (e) {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true; sx = e.clientX; sy = e.clientY; ox = ct.x; oy = ct.y;
            el.classList.add('dragging'); e.preventDefault();
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    },

    // === SQL Generation ===
    _updateSQL: function () {
        var S = YDB.State;
        var selected = S.canvasTables.filter(function (t) { return t.selectedColumns.length > 0; });
        if (!selected.length) { document.getElementById('generated-sql').textContent = '-- Select columns to generate SQL'; return; }

        var multi = (function () { var ids = []; S.canvasTables.forEach(function (t) { if (ids.indexOf(t.connId) < 0) ids.push(t.connId); }); return ids.length > 1; })();
        var cols = [], joins = [];
        selected.forEach(function (t) {
            var pre = multi ? t.dbName + '.' + t.name : t.name;
            t.selectedColumns.forEach(function (c) { cols.push(pre + '.' + c); });
        });

        var first = S.canvasTables[0];
        var from = multi ? first.dbName + '.' + first.name : first.name;

        if (S.canvasJoins.length) {
            var joinedTables = [first.name]; // Track tables already in query
            S.canvasJoins.forEach(function (j) {
                var lt = S.canvasTables.find(function (t) { return t.id === j.leftId; });
                var rt = S.canvasTables.find(function (t) { return t.id === j.rightId; });
                if (!lt || !rt) return;

                // Determine which side is the new table to join
                var newTable, existingTable, newCol, existingCol;
                if (joinedTables.indexOf(rt.name) < 0) {
                    newTable = rt; existingTable = lt; newCol = j.rightCol; existingCol = j.leftCol;
                } else if (joinedTables.indexOf(lt.name) < 0) {
                    newTable = lt; existingTable = rt; newCol = j.leftCol; existingCol = j.rightCol;
                } else {
                    return; // Both tables already joined, skip
                }

                var np = multi ? newTable.dbName + '.' + newTable.name : newTable.name;
                var ep = multi ? existingTable.dbName + '.' + existingTable.name : existingTable.name;
                joins.push(j.type + ' ' + np + ' ON ' + ep + '.' + existingCol + ' = ' + np + '.' + newCol);
                joinedTables.push(newTable.name);
            });
        }

        var sql = (multi ? '-- Cross-Database Query (Federated)\n' : '') + 'SELECT\n  ' + cols.join(',\n  ') + '\nFROM ' + from;
        if (joins.length) sql += '\n' + joins.join('\n');
        sql += ';';
        document.getElementById('generated-sql').textContent = sql;
    },

    // === Execute ===
    generateAndRun: function () {
        var sql = document.getElementById('generated-sql').textContent;
        if (sql.indexOf('-- Select columns') === 0 || sql.indexOf('-- Drag') === 0) { YDB.UI.toast('Select columns first', 'warning'); return; }

        var conn = YDB.State.activeConnection;
        var container = document.getElementById('builder-results');

        // Detect if cross-database (multiple connections involved)
        var connIds = [];
        YDB.State.canvasTables.forEach(function (t) { if (connIds.indexOf(t.connId) < 0) connIds.push(t.connId); });
        var isCrossDb = connIds.length > 1;

        if (YDB.API.isOnline() && YDB.API.token) {
            if (isCrossDb && YDB.State.canvasJoins.length) {
                // Federated query — use /api/federated/execute
                var sources = YDB.State.canvasTables.map(function (t) {
                    return { connectionId: t.connId, table: t.name, columns: t.selectedColumns };
                });
                var join = null;
                if (YDB.State.canvasJoins.length) {
                    var j = YDB.State.canvasJoins[0];
                    var lt = YDB.State.canvasTables.find(function (t) { return t.id === j.leftId; });
                    var rt = YDB.State.canvasTables.find(function (t) { return t.id === j.rightId; });
                    join = {
                        leftIdx: sources.findIndex(function (s) { return s.connectionId == lt.connId && s.table === lt.name; }),
                        rightIdx: sources.findIndex(function (s) { return s.connectionId == rt.connId && s.table === rt.name; }),
                        leftCol: j.leftCol,
                        rightCol: j.rightCol,
                        type: j.type.replace(' JOIN', '')
                    };
                }
                YDB.API.post('/federated/execute', { sources: sources, join: join })
                    .then(function (result) {
                        if (!result.data || !result.data.length) { container.innerHTML = '<div class="alert alert-info text-sm m-2">0 rows returned</div>'; return; }
                        YDB.UI.renderTable('builder-results', result.columns, result.columns, result.data);
                        document.getElementById('builder-export-btns').classList.remove('hidden');
                        YDB.History.add(sql);
                        YDB.UI.toast('Federated query: ' + result.rowCount + ' rows', 'success');
                    })
                    .catch(function (err) { container.innerHTML = '<div class="alert alert-error text-sm m-2">' + err.message + '</div>'; });
            } else if (conn && conn.id) {
                // Single-DB query
                YDB.API.post('/query/execute', { connectionId: conn.id, sql: sql })
                    .then(function (result) {
                        if (!result.data || !result.data.length) { container.innerHTML = '<div class="alert alert-info text-sm m-2">0 rows returned</div>'; return; }
                        YDB.UI.renderTable('builder-results', result.columns, result.columns, result.data);
                        document.getElementById('builder-export-btns').classList.remove('hidden');
                        YDB.History.add(sql);
                        YDB.UI.toast('Query executed: ' + result.rowCount + ' rows', 'success');
                    })
                    .catch(function (err) { container.innerHTML = '<div class="alert alert-error text-sm m-2">' + err.message + '</div>'; });
            } else {
                container.innerHTML = '<div class="alert alert-warning text-sm m-2">Select a connection first</div>';
            }
        } else {
            // Fallback to mock engine
            var result = YDB.QueryEngine.execute(sql);
            if (result.error) { container.innerHTML = '<div class="alert alert-error text-sm m-2">' + result.error + '</div>'; return; }
            if (!result.data.length) { container.innerHTML = '<div class="alert alert-info text-sm m-2">0 rows returned</div>'; return; }
            YDB.UI.renderTable('builder-results', result.columns, result.columns, result.data);
            document.getElementById('builder-export-btns').classList.remove('hidden');
            YDB.History.add(sql);
            YDB.Audit.log(sql);
            YDB.UI.toast('Query executed: ' + result.data.length + ' rows', 'success');
        }
    },

    _autoRerun: function () {
        if (document.getElementById('builder-export-btns').classList.contains('hidden')) return;
        var sql = document.getElementById('generated-sql').textContent;
        if (sql.indexOf('-- Drag') === 0 || sql.indexOf('-- Select columns') === 0) return;
        // Re-use generateAndRun which handles both single and federated queries
        this.generateAndRun();
    },

    // === Zoom ===
    zoom: function (delta) { this.setZoom(YDB.State.canvasZoom + delta); },
    setZoom: function (level) {
        YDB.State.canvasZoom = Math.max(YDB.Config.ZOOM_MIN, Math.min(YDB.Config.ZOOM_MAX, level));
        var canvas = document.getElementById('query-canvas');
        canvas.style.transform = 'scale(' + YDB.State.canvasZoom + ')';
        var pct = 100 / YDB.State.canvasZoom;
        canvas.style.width = pct + '%'; canvas.style.height = pct + '%';
        document.getElementById('zoom-level').textContent = Math.round(YDB.State.canvasZoom * 100) + '%';
    },

    // === Clear ===
    clearCanvas: function () {
        YDB.State.canvasTables = []; YDB.State.canvasJoins = []; YDB.State.canvasNextId = 1;
        document.getElementById('canvas-placeholder').style.display = '';
        document.getElementById('generated-sql').textContent = '-- Drag tables and select columns to generate SQL';
        document.getElementById('builder-results').innerHTML = '<p class="text-base-content/40 text-sm text-center mt-8">Results will appear here</p>';
        document.getElementById('builder-export-btns').classList.add('hidden');
        this._renderCanvas();
    },

    // === Auto Suggest Join ===
    _autoSuggest: function (newTable) {
        var schema = YDB.MockData.schemas[newTable.connId];
        var newCols = schema.tables[newTable.name].columns;
        var suggestions = [], others = YDB.State.canvasTables.filter(function (t) { return t.id !== newTable.id; });

        others.forEach(function (existing) {
            var es = YDB.MockData.schemas[existing.connId]; if (!es) return;
            var eCols = es.tables[existing.name].columns;
            var best = null, bestScore = 0;
            newCols.forEach(function (nc) {
                eCols.forEach(function (ec) {
                    var score = YDB.Builder._matchScore(nc, ec, newTable.name, existing.name);
                    if (score > bestScore) { bestScore = score; best = { leftId: existing.id, leftCol: ec.name, rightId: newTable.id, rightCol: nc.name, leftName: existing.connName + '.' + existing.name, rightName: newTable.connName + '.' + newTable.name }; }
                });
            });
            if (best && bestScore >= YDB.Config.JOIN_SCORE_THRESHOLD) suggestions.push(best);
        });

        if (suggestions.length) this._showSuggestions(suggestions);
    },

    _matchScore: function (a, b, tableA, tableB) {
        var score = 0, na = a.name.toLowerCase(), nb = b.name.toLowerCase();
        if (na === nb) score += 4;
        var sa = tableA.replace(/s$/, '').toLowerCase(), sb = tableB.replace(/s$/, '').toLowerCase();
        if (na === sb + '_id' && nb === 'id') score += 5;
        if (nb === sa + '_id' && na === 'id') score += 5;
        if ((a.key === 'PK' && b.key === 'FK') || (a.key === 'FK' && b.key === 'PK')) score += 3;
        return score;
    },

    _showSuggestions: function (suggestions) {
        YDB.State.pendingSuggestions = suggestions;
        var h = '<div class="alert alert-info p-2 m-2 text-xs" id="join-suggestion"><div class="flex flex-col gap-1 w-full">'
            + '<div class="flex items-center gap-1"><i data-lucide="sparkles" class="w-3 h-3"></i><b>Suggested Join</b></div>';
        suggestions.forEach(function (s, i) {
            h += '<div class="flex items-center gap-1 flex-wrap"><span class="badge badge-xs font-mono">' + s.leftName + '.' + s.leftCol + '</span> = '
                + '<span class="badge badge-xs font-mono">' + s.rightName + '.' + s.rightCol + '</span>'
                + '<button class="btn btn-primary btn-xs" onclick="YDB.Builder.acceptJoin(' + i + ')">Accept</button></div>';
        });
        h += '<div class="flex gap-1 mt-1">';
        if (suggestions.length > 1) h += '<button class="btn btn-primary btn-xs" onclick="YDB.Builder.acceptAllJoins()">Accept All</button>';
        h += '<button class="btn btn-ghost btn-xs" onclick="YDB.Builder.dismissSuggestion()">Dismiss</button></div></div></div>';
        var el = document.getElementById('builder-results');
        var old = document.getElementById('join-suggestion'); if (old) old.remove();
        el.insertAdjacentHTML('afterbegin', h);
        YDB.UI.icons();
    },

    acceptJoin: function (idx) {
        var s = YDB.State.pendingSuggestions; if (!s || !s[idx]) return;
        var m = s[idx];
        YDB.State.canvasJoins.push({ id: Date.now(), leftId: m.leftId, leftCol: m.leftCol, rightId: m.rightId, rightCol: m.rightCol, type: 'INNER JOIN' });
        this._autoSelectCols(m.leftId); this._autoSelectCols(m.rightId);
        s.splice(idx, 1);
        if (!s.length) this.dismissSuggestion(); else this._showSuggestions(s);
        this._renderCanvas(); YDB.UI.toast('Join applied!', 'success');
    },

    acceptAllJoins: function () {
        var s = YDB.State.pendingSuggestions; if (!s) return;
        var self = this;
        s.forEach(function (m) {
            YDB.State.canvasJoins.push({ id: Date.now() + Math.random(), leftId: m.leftId, leftCol: m.leftCol, rightId: m.rightId, rightCol: m.rightCol, type: 'INNER JOIN' });
            self._autoSelectCols(m.leftId); self._autoSelectCols(m.rightId);
        });
        this.dismissSuggestion(); this._renderCanvas(); YDB.UI.toast('All joins applied!', 'success');
    },

    dismissSuggestion: function () { YDB.State.pendingSuggestions = null; var el = document.getElementById('join-suggestion'); if (el) el.remove(); },

    /**
     * AI-powered join suggestion — analyzes all tables on canvas and suggests relationships.
     */
    aiSuggestJoin: function () {
        var conn = YDB.State.activeConnection;
        if (!YDB.API.isOnline() || !YDB.API.token) { YDB.UI.toast('Backend not available', 'error'); return; }

        var tables = YDB.State.canvasTables;
        if (!tables || tables.length < 2) { YDB.UI.toast('Drop at least 2 tables to suggest joins', 'info'); return; }

        YDB.UI.toast('AI analyzing relationships...', 'info');

        // Ensure schemas are loaded for all canvas table connections
        var connIds = [];
        tables.forEach(function (t) { if (t.connId && connIds.indexOf(t.connId) < 0) connIds.push(t.connId); });

        var needsFetch = connIds.filter(function (cid) { return !YDB.MockData.schemas[cid]; });
        if (needsFetch.length > 0) {
            Promise.all(needsFetch.map(function (cid) {
                return YDB.API.get('/explorer/' + cid + '/schema').then(function (schema) {
                    YDB.MockData.schemas[cid] = schema;
                }).catch(function () {});
            })).then(function () { YDB.Builder._doAiAnalysis(tables); });
            return;
        }

        this._doAiAnalysis(tables);
    },

    _doAiAnalysis: function (tables) {

        // Analyze all canvas tables directly using column info from schema cache
        var canvasSuggestions = [];
        for (var i = 0; i < tables.length; i++) {
            for (var j = i + 1; j < tables.length; j++) {
                var tA = tables[i], tB = tables[j];
                // Get columns from schema cache (not from canvas table object)
                var schemaA = YDB.MockData.schemas[tA.connId];
                var schemaB = YDB.MockData.schemas[tB.connId];
                var colsA = (schemaA && schemaA.tables && schemaA.tables[tA.name]) ? (schemaA.tables[tA.name].columns || []) : [];
                var colsB = (schemaB && schemaB.tables && schemaB.tables[tB.name]) ? (schemaB.tables[tB.name].columns || []) : [];
                var nameA = tA.name, nameB = tB.name;
                var singularA = nameA.replace(/s$/, '').toLowerCase();
                var singularB = nameB.replace(/s$/, '').toLowerCase();

                // Strategy 1: FK naming pattern
                for (var ci = 0; ci < colsA.length; ci++) {
                    var cn = (colsA[ci].name || colsA[ci]).toLowerCase();
                    if (cn === singularB + '_id') {
                        canvasSuggestions.push({ leftId: tA.id, leftName: nameA, leftCol: colsA[ci].name || colsA[ci], rightId: tB.id, rightName: nameB, rightCol: 'id', confidence: 0.95, reason: 'FK: ' + nameA + '.' + cn + ' → ' + nameB + '.id' });
                    }
                }
                for (var ci = 0; ci < colsB.length; ci++) {
                    var cn = (colsB[ci].name || colsB[ci]).toLowerCase();
                    if (cn === singularA + '_id') {
                        canvasSuggestions.push({ leftId: tA.id, leftName: nameA, leftCol: 'id', rightId: tB.id, rightName: nameB, rightCol: colsB[ci].name || colsB[ci], confidence: 0.95, reason: 'FK: ' + nameB + '.' + cn + ' → ' + nameA + '.id' });
                    }
                }

                // Strategy 2: Same column name (both have user_id, both have email, etc.)
                for (var ci = 0; ci < colsA.length; ci++) {
                    var aName = (colsA[ci].name || colsA[ci]).toLowerCase();
                    if (aName === 'id') continue;
                    for (var cj = 0; cj < colsB.length; cj++) {
                        var bName = (colsB[cj].name || colsB[cj]).toLowerCase();
                        if (bName === 'id') continue;
                        if (aName === bName && aName.endsWith('_id')) {
                            canvasSuggestions.push({ leftId: tA.id, leftName: nameA, leftCol: colsA[ci].name || colsA[ci], rightId: tB.id, rightName: nameB, rightCol: colsB[cj].name || colsB[cj], confidence: 0.85, reason: 'Shared key: ' + aName });
                        }
                    }
                }

                // Strategy 3: ID column in one matches *_id pattern in other
                for (var ci = 0; ci < colsA.length; ci++) {
                    var aName = (colsA[ci].name || colsA[ci]).toLowerCase();
                    if (aName === 'id') {
                        for (var cj = 0; cj < colsB.length; cj++) {
                            var bName = (colsB[cj].name || colsB[cj]).toLowerCase();
                            if (bName.endsWith('_id') && bName.includes(singularA)) {
                                canvasSuggestions.push({ leftId: tA.id, leftName: nameA, leftCol: 'id', rightId: tB.id, rightName: nameB, rightCol: colsB[cj].name || colsB[cj], confidence: 0.8, reason: 'ID match: ' + nameA + '.id ↔ ' + nameB + '.' + bName });
                            }
                        }
                    }
                }
                for (var ci = 0; ci < colsB.length; ci++) {
                    var bName = (colsB[ci].name || colsB[ci]).toLowerCase();
                    if (bName === 'id') {
                        for (var cj = 0; cj < colsA.length; cj++) {
                            var aName = (colsA[cj].name || colsA[cj]).toLowerCase();
                            if (aName.endsWith('_id') && aName.includes(singularB)) {
                                canvasSuggestions.push({ leftId: tA.id, leftName: nameA, leftCol: colsA[cj].name || colsA[cj], rightId: tB.id, rightName: nameB, rightCol: 'id', confidence: 0.8, reason: 'ID match: ' + nameB + '.id ↔ ' + nameA + '.' + aName });
                            }
                        }
                    }
                }

                // Strategy 4: Any _id column to any id column (loose)
                if (canvasSuggestions.filter(function(s){ return s.leftName===nameA && s.rightName===nameB; }).length === 0) {
                    var anyIdA = colsA.find(function(c){ return (c.name||c).toLowerCase().endsWith('_id'); });
                    var hasIdB = colsB.find(function(c){ return (c.name||c).toLowerCase() === 'id'; });
                    if (anyIdA && hasIdB) {
                        canvasSuggestions.push({ leftId: tA.id, leftName: nameA, leftCol: anyIdA.name || anyIdA, rightId: tB.id, rightName: nameB, rightCol: 'id', confidence: 0.5, reason: 'Loose: ' + nameA + '.' + (anyIdA.name||anyIdA) + ' may reference ' + nameB + '.id' });
                    }
                    var anyIdB = colsB.find(function(c){ return (c.name||c).toLowerCase().endsWith('_id'); });
                    var hasIdA = colsA.find(function(c){ return (c.name||c).toLowerCase() === 'id'; });
                    if (anyIdB && hasIdA) {
                        canvasSuggestions.push({ leftId: tA.id, leftName: nameA, leftCol: 'id', rightId: tB.id, rightName: nameB, rightCol: anyIdB.name || anyIdB, confidence: 0.5, reason: 'Loose: ' + nameB + '.' + (anyIdB.name||anyIdB) + ' may reference ' + nameA + '.id' });
                    }
                }
            }
        }

        // Deduplicate
        var seen = {};
        canvasSuggestions = canvasSuggestions.filter(function (s) {
            var key = s.leftName + '.' + s.leftCol + '-' + s.rightName + '.' + s.rightCol;
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        }).sort(function (a, b) { return b.confidence - a.confidence; });

        if (canvasSuggestions.length > 0) {
            YDB.Builder._showSuggestions(canvasSuggestions);
            YDB.UI.toast('AI found ' + canvasSuggestions.length + ' relationship(s)', 'success');
        } else {
            // Smart analysis — show what columns each table has and propose strategies
            var el = document.getElementById('builder-results');
            var old = document.getElementById('join-suggestion'); if (old) old.remove();

            var h = '<div class="bg-base-200 border border-base-300 rounded-lg p-4 m-2 text-sm" id="join-suggestion">';
            h += '<div class="font-semibold text-base-content mb-3">AI Relationship Analysis</div>';

            // Analyze each table pair and show compatible columns
            for (var i = 0; i < tables.length; i++) {
                for (var j = i + 1; j < tables.length; j++) {
                    var tA = tables[i], tB = tables[j];
                    var schA = YDB.MockData.schemas[tA.connId];
                    var schB = YDB.MockData.schemas[tB.connId];
                    var cA = (schA && schA.tables && schA.tables[tA.name]) ? (schA.tables[tA.name].columns || []) : [];
                    var cB = (schB && schB.tables && schB.tables[tB.name]) ? (schB.tables[tB.name].columns || []) : [];

                    h += '<div class="mb-3 p-2 bg-base-300/50 rounded">';
                    h += '<div class="text-xs font-semibold text-primary mb-1">' + tA.name + ' ↔ ' + tB.name + '</div>';

                    // Show ID columns from each table
                    var idColsA = cA.filter(function(c) { return (c.name||c).toLowerCase().endsWith('_id') || (c.name||c).toLowerCase() === 'id'; }).map(function(c) { return c.name || c; });
                    var idColsB = cB.filter(function(c) { return (c.name||c).toLowerCase().endsWith('_id') || (c.name||c).toLowerCase() === 'id'; }).map(function(c) { return c.name || c; });

                    h += '<div class="text-xs text-base-content/70 mb-1">';
                    h += '<span class="text-info">' + tA.name + '</span> keys: ' + (idColsA.length > 0 ? idColsA.join(', ') : 'none') + '<br>';
                    h += '<span class="text-info">' + tB.name + '</span> keys: ' + (idColsB.length > 0 ? idColsB.join(', ') : 'none');
                    h += '</div>';

                    // Find shared column names
                    var namesA = cA.map(function(c) { return (c.name||c).toLowerCase(); });
                    var namesB = cB.map(function(c) { return (c.name||c).toLowerCase(); });
                    var shared = namesA.filter(function(n) { return namesB.includes(n) && n !== 'created_at' && n !== 'updated_at'; });

                    if (shared.length > 0) {
                        h += '<div class="text-xs text-success mt-1">Shared columns: ' + shared.join(', ') + '</div>';
                        h += '<div class="text-xs text-base-content/60 mt-1">Try: JOIN ON ' + tA.name + '.' + shared[0] + ' = ' + tB.name + '.' + shared[0] + '</div>';
                    } else {
                        h += '<div class="text-xs text-base-content/60 mt-1">No shared columns. Possible approaches:</div>';
                        h += '<div class="text-xs text-base-content/60">- Create a mapping table linking these entities</div>';
                        if (idColsA.length > 0 && idColsB.length > 0) {
                            h += '<div class="text-xs text-base-content/60">- Try: ' + tA.name + '.' + idColsA[0] + ' = ' + tB.name + '.' + idColsB[0] + ' (if logically related)</div>';
                        }
                    }
                    h += '</div>';
                }
            }

            h += '<button class="btn btn-ghost btn-xs mt-2" onclick="YDB.Builder.dismissSuggestion()">Dismiss</button>';
            h += '</div>';
            el.insertAdjacentHTML('afterbegin', h);
        }
    },

    _autoSelectCols: function (tableId) {
        var ct = YDB.State.canvasTables.find(function (t) { return t.id === tableId; });
        if (!ct || ct.selectedColumns.length) return;
        var schema = YDB.MockData.schemas[ct.connId]; if (!schema) return;
        ct.selectedColumns = schema.tables[ct.name].columns.map(function (c) { return c.name; });
    },

    // === Save as DB ===
    openSaveModal: function () {
        var d = YDB.UI.getResultsData('builder-results');
        if (!d) { YDB.UI.toast('Run a query first', 'warning'); return; }
        var names = YDB.State.canvasTables.map(function (t) { return t.name; });
        document.getElementById('save-db-name').value = 'Joined - ' + names.join(' + ');
        document.getElementById('save-db-table').value = names.join('_') + '_joined';
        document.getElementById('modal-save-db').showModal();
    },

    confirmSaveAsDb: function () {
        var connName = document.getElementById('save-db-name').value.trim();
        var tableName = document.getElementById('save-db-table').value.trim().replace(/\s+/g, '_').toLowerCase();
        if (!connName || !tableName) { YDB.UI.toast('Fill both fields', 'warning'); return; }
        var d = YDB.UI.getResultsData('builder-results');
        if (!d) return;

        var newId = 'conn-v-' + Date.now();
        var columns = d.columns.map(function (c) {
            var sample = d.data[0] ? d.data[0][c] : '';
            return { name: c, type: typeof sample === 'number' ? 'NUMERIC' : 'VARCHAR', key: '', nullable: true };
        });
        YDB.MockData.schemas[newId] = { name: tableName + '_db', tables: {}, views: [] };
        YDB.MockData.schemas[newId].tables[tableName] = { columns: columns, data: d.data };
        YDB.MockData.relationships[newId] = [];
        YDB.State.connections.push({ id: newId, name: connName, type: 'virtual', host: 'local', port: '', username: '', password: '', database: tableName + '_db' });
        YDB.State.save();
        document.getElementById('modal-save-db').close();
        YDB.Connections.render(); this.renderTablesList();
        YDB.UI.toast('Virtual DB "' + connName + '" created!', 'success');
    }
};
