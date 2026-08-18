/**
 * YDB - Chart Builder
 * Generate charts (bar, line, pie, scatter) from query results using Chart.js.
 */
YDB.Charts = {
    chart: null,

    init: function () {
        var self = this;
        document.getElementById('btn-create-chart').addEventListener('click', function () { self.generate(); });
        document.getElementById('chart-type').addEventListener('change', function () { if (self.chart) self.generate(); });
    },

    generate: function () {
        var data = YDB.UI.getResultsData('sql-results') || YDB.UI.getResultsData('builder-results') || YDB.UI.getResultsData('data-viewer');
        if (!data || !data.data.length) { YDB.UI.toast('Run a query first (SQL, Builder, or Explorer), then come back to Charts', 'warning'); return; }

        var type = document.getElementById('chart-type').value;
        var labelCol = document.getElementById('chart-label-col').value;
        var valueCol = document.getElementById('chart-value-col').value;

        if (!labelCol || !valueCol) { YDB.UI.toast('Select label and value columns', 'warning'); return; }

        var labels = data.data.map(function (r) { return r[labelCol] || ''; });
        var values = data.data.map(function (r) { return parseFloat(r[valueCol]) || 0; });

        var colors = ['#4479A1', '#336791', '#47A248', '#F80000', '#29B5E8', '#FDEE21', '#E25A1C', '#8C4FFF', '#10B981', '#DC382D', '#6933FF', '#F37440'];

        // Show canvas, hide placeholder
        var canvas = document.getElementById('chart-canvas');
        canvas.style.display = 'block';
        var placeholder = document.getElementById('chart-placeholder');
        if (placeholder) placeholder.style.display = 'none';

        var ctx = canvas.getContext('2d');
        if (this.chart) this.chart.destroy();

        this.chart = new Chart(ctx, {
            type: type === 'scatter' ? 'scatter' : type,
            data: {
                labels: type !== 'scatter' ? labels : undefined,
                datasets: [{
                    label: valueCol,
                    data: type === 'scatter' ? values.map(function (v, i) { return { x: i, y: v }; }) : values,
                    backgroundColor: type === 'pie' || type === 'doughnut' ? colors.slice(0, values.length) : colors[0] + '80',
                    borderColor: type === 'pie' || type === 'doughnut' ? colors.slice(0, values.length) : colors[0],
                    borderWidth: 1,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: type === 'pie' || type === 'doughnut' } }
            }
        });

        YDB.UI.toast('Chart generated', 'success');
    },

    populateColumns: function (containerId) {
        var data = YDB.UI.getResultsData(containerId || 'sql-results') || YDB.UI.getResultsData('builder-results') || YDB.UI.getResultsData('data-viewer');
        var labelSel = document.getElementById('chart-label-col');
        var valueSel = document.getElementById('chart-value-col');

        // If no results yet, try to use active table schema directly
        if (!data && YDB.State.activeConnection && YDB.State.activeTable) {
            var schema = YDB.MockData.schemas[YDB.State.activeConnection.id];
            if (schema && schema.tables[YDB.State.activeTable]) {
                var cols = schema.tables[YDB.State.activeTable].columns.map(function (c) { return c.name; });
                data = { columns: cols };
            }
        }

        if (!data || !data.columns) {
            labelSel.innerHTML = '<option value="">Run a query first...</option>';
            valueSel.innerHTML = '<option value="">Run a query first...</option>';
            return;
        }
        var opts = data.columns.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
        labelSel.innerHTML = '<option value="">Select label...</option>' + opts;
        valueSel.innerHTML = '<option value="">Select value...</option>' + opts;
    },

    pinToDashboard: function () {
        if (!this.chart) { YDB.UI.toast('Generate a chart first', 'warning'); return; }
        var name = prompt('Chart name for dashboard:');
        if (!name) return;
        var type = document.getElementById('chart-type').value;
        var labelCol = document.getElementById('chart-label-col').value;
        var valueCol = document.getElementById('chart-value-col').value;
        YDB.Dashboard.addWidget({ type: 'chart', name: name, chartType: type, labelCol: labelCol, valueCol: valueCol, data: this.chart.data });
    }
};
