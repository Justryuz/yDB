/**
 * YDB - Query Explain/Plan
 * Mock execution plan visualization.
 */
YDB.Explain = {
    init: function () {},

    /**
     * Generate a mock explain plan for a SQL query
     */
    run: function (sql) {
        var flat = sql.toLowerCase().replace(/\s+/g, ' ').trim();
        var steps = [];
        var cost = 0;

        // Detect tables
        var fromMatch = flat.match(/from\s+([\w.]+)/);
        if (fromMatch) {
            var tableName = fromMatch[1].split('.').pop();
            steps.push({ op: 'Seq Scan', table: tableName, cost: 10, rows: '~100', detail: 'Full table scan' });
            cost += 10;
        }

        // Detect joins
        var joins = flat.match(/join\s+([\w.]+)/g);
        if (joins) {
            joins.forEach(function (j) {
                var tn = j.replace(/join\s+/, '').split('.').pop();
                steps.push({ op: 'Hash Join', table: tn, cost: 25, rows: '~50', detail: 'Hash join using index' });
                cost += 25;
            });
        }

        // Detect WHERE
        if (flat.indexOf('where') >= 0) {
            steps.push({ op: 'Filter', table: '-', cost: 2, rows: '~30', detail: 'Row filtering' });
            cost += 2;
        }

        // Detect ORDER BY
        if (flat.indexOf('order by') >= 0) {
            steps.push({ op: 'Sort', table: '-', cost: 8, rows: '~30', detail: 'QuickSort in memory' });
            cost += 8;
        }

        // Detect GROUP BY
        if (flat.indexOf('group by') >= 0) {
            steps.push({ op: 'Aggregate', table: '-', cost: 5, rows: '~10', detail: 'HashAggregate' });
            cost += 5;
        }

        // Detect LIMIT
        if (flat.indexOf('limit') >= 0) {
            steps.push({ op: 'Limit', table: '-', cost: 0.1, rows: '~N', detail: 'Limit output rows' });
            cost += 0.1;
        }

        if (!steps.length) {
            steps.push({ op: 'Result', table: '-', cost: 0.01, rows: '1', detail: 'Constant result' });
        }

        return { steps: steps, totalCost: cost.toFixed(2), planTime: (Math.random() * 2 + 0.5).toFixed(2) + 'ms' };
    },

    /**
     * Render explain plan in a container
     */
    render: function (containerId, sql) {
        var plan = this.run(sql);
        var h = '<div class="p-3">';
        h += '<div class="flex items-center gap-3 mb-3"><span class="badge badge-primary">Total Cost: ' + plan.totalCost + '</span><span class="badge badge-ghost">Plan Time: ' + plan.planTime + '</span></div>';
        h += '<div class="space-y-2">';

        plan.steps.forEach(function (step, idx) {
            var width = Math.min(100, (step.cost / plan.totalCost) * 100 + 10);
            h += '<div class="flex items-center gap-3">';
            h += '<div class="w-6 text-xs text-base-content/40">' + (idx + 1) + '</div>';
            h += '<div class="flex-1">';
            h += '<div class="flex items-center justify-between"><span class="text-xs font-semibold">' + step.op + '</span><span class="text-xs text-base-content/50">' + step.detail + '</span></div>';
            h += '<div class="flex items-center gap-2 mt-0.5">';
            h += '<div class="flex-1 bg-base-200 rounded-full h-2"><div class="bg-primary rounded-full h-2" style="width:' + width + '%"></div></div>';
            h += '<span class="text-xs text-base-content/40 w-20">cost: ' + step.cost + '</span>';
            h += '<span class="text-xs text-base-content/40 w-16">rows: ' + step.rows + '</span>';
            if (step.table !== '-') h += '<span class="badge badge-xs">' + step.table + '</span>';
            h += '</div></div></div>';
        });

        h += '</div></div>';
        document.getElementById(containerId).innerHTML = h;
    }
};
