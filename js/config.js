/**
 * @file config.js
 * @description Application-wide constants and configuration.
 * @module YDB.Config
 */

var YDB = window.YDB || {};

YDB.Config = Object.freeze({

    // ── App Settings ──────────────────────────────────────────
    APP_NAME: 'yDB',
    APP_SLOGAN: 'Tame any database.',
    APP_VERSION: '1.0.0',

    // ── UI Defaults ───────────────────────────────────────────
    DEFAULT_PER_PAGE: 25,
    SPLASH_DURATION: 2000,
    TOAST_DURATION: 3000,
    DEBOUNCE_MS: 100,

    // ── Canvas / Zoom ─────────────────────────────────────────
    ZOOM_MIN: 0.3,
    ZOOM_MAX: 1.5,
    ZOOM_STEP: 0.1,

    // ── Join Detection ────────────────────────────────────────
    JOIN_SCORE_THRESHOLD: 2,

    // ── Default Ports per DB type ─────────────────────────────
    PORTS: Object.freeze({
        mysql: 3306, mariadb: 3306, postgresql: 5432, sqlite: 0,
        oracle: 1521, mssql: 1433, db2: 50000, firebird: 3050, h2: 9092,
        snowflake: 443, clickhouse: 8123, teradata: 1025, greenplum: 5432,
        vertica: 5433, hive: 10000, spark: 10015,
        redshift: 5439, athena: 443, dynamodb: 443, bigquery: 443,
        spanner: 443, cloudsql: 3306, azuresql: 1433, synapse: 1433,
        cockroachdb: 26257,
        mongodb: 27017, cassandra: 9042, redis: 6379,
        couchbase: 8091, influxdb: 8086, neo4j: 7687
    }),

    // ── DB Type Metadata (name + brand color) ─────────────────
    DB_TYPES: Object.freeze({
        mysql:       { name: 'MySQL',       color: '#4479A1' },
        mariadb:     { name: 'MariaDB',     color: '#003545' },
        postgresql:  { name: 'PostgreSQL',  color: '#336791' },
        sqlite:      { name: 'SQLite',      color: '#003B57' },
        oracle:      { name: 'Oracle',      color: '#F80000' },
        mssql:       { name: 'SQL Server',  color: '#CC2927' },
        db2:         { name: 'IBM DB2',     color: '#054ADA' },
        firebird:    { name: 'Firebird',    color: '#F5820D' },
        h2:          { name: 'H2',          color: '#0000BB' },
        snowflake:   { name: 'Snowflake',   color: '#29B5E8' },
        clickhouse:  { name: 'ClickHouse',  color: '#FFCC00' },
        teradata:    { name: 'Teradata',    color: '#F37440' },
        greenplum:   { name: 'Greenplum',   color: '#72B033' },
        vertica:     { name: 'Vertica',     color: '#0073C6' },
        hive:        { name: 'Hive',        color: '#FDEE21' },
        spark:       { name: 'Spark',       color: '#E25A1C' },
        redshift:    { name: 'Redshift',    color: '#8C4FFF' },
        athena:      { name: 'Athena',      color: '#8C4FFF' },
        dynamodb:    { name: 'DynamoDB',    color: '#4053D6' },
        bigquery:    { name: 'BigQuery',    color: '#669DF6' },
        spanner:     { name: 'Spanner',     color: '#4285F4' },
        cloudsql:    { name: 'Cloud SQL',   color: '#4285F4' },
        azuresql:    { name: 'Azure SQL',   color: '#0078D4' },
        synapse:     { name: 'Synapse',     color: '#0078D4' },
        cockroachdb: { name: 'CockroachDB', color: '#6933FF' },
        mongodb:     { name: 'MongoDB',     color: '#47A248' },
        cassandra:   { name: 'Cassandra',   color: '#1287B1' },
        redis:       { name: 'Redis',       color: '#DC382D' },
        couchbase:   { name: 'Couchbase',   color: '#EA2328' },
        influxdb:    { name: 'InfluxDB',    color: '#22ADF6' },
        neo4j:       { name: 'Neo4j',       color: '#008CC1' },
        virtual:     { name: 'Virtual DB',  color: '#10B981' }
    })
});
