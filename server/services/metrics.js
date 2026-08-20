/**
 * @file services/metrics.js
 * @description Application metrics tracking — query latency, error rates, connections.
 * Exposes Prometheus-compatible /metrics endpoint.
 */

const metrics = {
    queries_total: 0,
    queries_errors: 0,
    queries_duration_sum: 0,
    active_connections: 0,
    active_sessions: 0,
    uptime_start: Date.now()
};

module.exports = {
    /** Record a successful query */
    recordQuery(durationMs) {
        metrics.queries_total++;
        metrics.queries_duration_sum += durationMs;
    },

    /** Record a failed query */
    recordError() {
        metrics.queries_total++;
        metrics.queries_errors++;
    },

    /** Set active connection count */
    setActiveConnections(count) {
        metrics.active_connections = count;
    },

    /** Get all metrics */
    getAll() {
        return {
            ...metrics,
            uptime_seconds: Math.floor((Date.now() - metrics.uptime_start) / 1000),
            avg_query_duration_ms: metrics.queries_total ? Math.round(metrics.queries_duration_sum / metrics.queries_total) : 0,
            error_rate: metrics.queries_total ? (metrics.queries_errors / metrics.queries_total * 100).toFixed(2) + '%' : '0%'
        };
    },

    /** Prometheus format */
    toPrometheus() {
        const m = this.getAll();
        return [
            '# HELP ydb_queries_total Total queries executed',
            '# TYPE ydb_queries_total counter',
            `ydb_queries_total ${m.queries_total}`,
            '',
            '# HELP ydb_queries_errors_total Total query errors',
            '# TYPE ydb_queries_errors_total counter',
            `ydb_queries_errors_total ${m.queries_errors}`,
            '',
            '# HELP ydb_query_duration_avg_ms Average query duration',
            '# TYPE ydb_query_duration_avg_ms gauge',
            `ydb_query_duration_avg_ms ${m.avg_query_duration_ms}`,
            '',
            '# HELP ydb_active_connections Active database connections',
            '# TYPE ydb_active_connections gauge',
            `ydb_active_connections ${m.active_connections}`,
            '',
            '# HELP ydb_uptime_seconds Server uptime',
            '# TYPE ydb_uptime_seconds counter',
            `ydb_uptime_seconds ${m.uptime_seconds}`,
            ''
        ].join('\n');
    }
};
