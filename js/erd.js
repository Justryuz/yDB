/**
 * YDB - ERD (Entity Relationship Diagram)
 * Auto-generates visual diagram from schema relationships.
 */
YDB.ERD = {
    init: function () {
        var self = this;
        document.getElementById('btn-gen-erd').addEventListener('click', function () { self.generate(); });
    },

    populateConnections: function () {
        var sel = document.getElementById('erd-connection');
        sel.innerHTML = '<option value="">Select connection...</option>';
        YDB.State.connections.forEach(function (c) {
            if (YDB.MockData.schemas[c.id]) sel.innerHTML += '<option value="' + c.id + '">' + c.name + '</option>';
        });
    },

    generate: function () {
        var connId = document.getElementById('erd-connection').value;
        if (!connId) { YDB.UI.toast('Select a connection', 'warning'); return; }

        var schema = YDB.MockData.schemas[connId];
        var rels = YDB.MockData.relationships[connId] || [];
        var tables = Object.keys(schema.tables);
        var canvas = document.getElementById('erd-canvas');

        // Layout tables in a grid
        var cols = Math.ceil(Math.sqrt(tables.length));
        var cellW = 260, cellH = 220, padX = 40, padY = 40;

        var h = '<div class="relative" style="min-width:' + (cols * (cellW + padX)) + 'px;min-height:' + (Math.ceil(tables.length / cols) * (cellH + padY)) + 'px;">';

        // Draw tables
        tables.forEach(function (tn, idx) {
            var col = idx % cols, row = Math.floor(idx / cols);
            var x = col * (cellW + padX) + padX;
            var y = row * (cellH + padY) + padY;
            var tbl = schema.tables[tn];
            var db = YDB.Config.DB_TYPES[YDB.State.connections.find(function (c) { return c.id === connId; }).type] || { color: '#666' };

            h += '<div class="absolute border border-base-300 rounded-lg bg-base-100 shadow-md" style="left:' + x + 'px;top:' + y + 'px;width:' + cellW + 'px;">';
            h += '<div class="px-3 py-2 rounded-t-lg font-semibold text-xs text-white" style="background:' + db.color + '">' + tn + '</div>';
            h += '<div class="px-2 py-1 max-h-40 overflow-y-auto">';
            tbl.columns.forEach(function (col) {
                var icon = col.key === 'PK' ? '🔑' : col.key === 'FK' ? '🔗' : '  ';
                h += '<div class="flex items-center gap-1 text-xs py-0.5 border-b border-base-200">';
                h += '<span class="w-4">' + icon + '</span>';
                h += '<span class="font-medium">' + col.name + '</span>';
                h += '<span class="text-base-content/40 ml-auto text-xs">' + col.type + '</span>';
                h += '</div>';
            });
            h += '</div></div>';
        });

        // Draw relationship lines using SVG — curved bezier paths
        h += '<svg class="absolute inset-0 w-full h-full pointer-events-none" style="z-index:0;overflow:visible;">';
        rels.forEach(function (rel) {
            var fromIdx = tables.indexOf(rel.from);
            var toIdx = tables.indexOf(rel.to);
            if (fromIdx < 0 || toIdx < 0) return;

            var fromCol = fromIdx % cols, fromRow = Math.floor(fromIdx / cols);
            var toCol = toIdx % cols, toRow = Math.floor(toIdx / cols);

            // Calculate connection points on table edges
            var fromX, fromY, toX, toY;
            var fromCenterX = fromCol * (cellW + padX) + padX + cellW / 2;
            var fromCenterY = fromRow * (cellH + padY) + padY + cellH / 2;
            var toCenterX = toCol * (cellW + padX) + padX + cellW / 2;
            var toCenterY = toRow * (cellH + padY) + padY + cellH / 2;

            // Determine which side to connect from/to
            if (Math.abs(toCenterX - fromCenterX) > Math.abs(toCenterY - fromCenterY)) {
                // Horizontal connection
                if (toCenterX > fromCenterX) {
                    fromX = fromCol * (cellW + padX) + padX + cellW; // right edge
                    toX = toCol * (cellW + padX) + padX; // left edge
                } else {
                    fromX = fromCol * (cellW + padX) + padX; // left edge
                    toX = toCol * (cellW + padX) + padX + cellW; // right edge
                }
                fromY = fromCenterY;
                toY = toCenterY;
            } else {
                // Vertical connection
                if (toCenterY > fromCenterY) {
                    fromY = fromRow * (cellH + padY) + padY + cellH; // bottom edge
                    toY = toRow * (cellH + padY) + padY; // top edge
                } else {
                    fromY = fromRow * (cellH + padY) + padY; // top edge
                    toY = toRow * (cellH + padY) + padY + cellH; // bottom edge
                }
                fromX = fromCenterX;
                toX = toCenterX;
            }

            // Bezier control points for smooth curve
            var dx = toX - fromX, dy = toY - fromY;
            var cx1 = fromX + dx * 0.4, cy1 = fromY;
            var cx2 = toX - dx * 0.4, cy2 = toY;

            // Draw path
            h += '<path d="M' + fromX + ' ' + fromY + ' C' + cx1 + ' ' + cy1 + ' ' + cx2 + ' ' + cy2 + ' ' + toX + ' ' + toY + '" '
                + 'fill="none" stroke="oklch(var(--p))" stroke-width="2" stroke-opacity="0.6" />';

            // Arrow at end
            var angle = Math.atan2(toY - cy2, toX - cx2);
            var arrLen = 8;
            var ax1 = toX - arrLen * Math.cos(angle - 0.4), ay1 = toY - arrLen * Math.sin(angle - 0.4);
            var ax2 = toX - arrLen * Math.cos(angle + 0.4), ay2 = toY - arrLen * Math.sin(angle + 0.4);
            h += '<polygon points="' + toX + ',' + toY + ' ' + ax1 + ',' + ay1 + ' ' + ax2 + ',' + ay2 + '" fill="oklch(var(--p))" fill-opacity="0.6" />';

            // Label at midpoint
            var midX = (fromX + toX) / 2, midY = (fromY + toY) / 2;
            h += '<rect x="' + (midX - 30) + '" y="' + (midY - 10) + '" width="60" height="16" rx="3" fill="oklch(var(--b1))" stroke="oklch(var(--b3))" stroke-width="1" />';
            h += '<text x="' + midX + '" y="' + (midY + 2) + '" text-anchor="middle" fill="oklch(var(--p))" font-size="8" font-family="monospace">' + rel.fromCol + ' → ' + rel.toCol + '</text>';

            // Dot at start
            h += '<circle cx="' + fromX + '" cy="' + fromY + '" r="4" fill="oklch(var(--p))" fill-opacity="0.6" />';
        });
        h += '</svg>';
        h += '</div>';

        canvas.innerHTML = h;
        YDB.UI.toast('ERD generated with ' + tables.length + ' tables', 'success');
    }
};
