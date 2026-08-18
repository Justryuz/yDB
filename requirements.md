# yDB - Tame any database.

## Overview
yDB is a web-based database management tool similar to phpMyAdmin but with multi-connection support like DBeaver. It supports a wide range of database types and features a visual query builder with cross-database join capabilities as its core feature.

## Target Users
- Developers managing databases during development
- DBAs (Database Administrators) needing a lightweight tool for daily tasks
- Non-technical teams who need data access without using CLI

## Active Features (Visible Tabs)

### 1. Explorer
- Tree structure navigation (database > schema > tables > columns)
- Browse tables, views, indexes, and columns
- Data viewer with pagination, sorting, filtering
- Inline data editor (CRUD) with SQL generation
- DDL/CREATE TABLE viewer with copy
- Table Structure editor (add/modify/drop columns)
- Data masking toggle for sensitive columns
- Query Explain/Plan visualization
- Export data (CSV, JSON, Excel)

### 2. Visual Builder
- Drag-and-drop tables from any database onto the canvas
- Cross-database joins (federated queries)
- Select/deselect columns via checkboxes with live SQL update
- Auto-detect matching join columns (FK/PK naming conventions)
- Manual join creation (INNER, LEFT, RIGHT, FULL OUTER, CROSS)
- Generated SQL in right sidebar panel with copy button
- Generate & Run with live results
- Save joined results as virtual database connection
- Canvas zoom in/out (30% - 150%)
- Results with pagination and export

### 3. SQL Editor
- Syntax-aware textarea editor
- Auto-complete (tables, columns, SQL keywords)
- Execute with Ctrl+Enter shortcut
- Multiple query tabs
- SQL formatting
- Results with pagination
- Export results (CSV, JSON, Excel)

### 4. Dashboard
- Pin charts and query results as widgets
- Grid layout with multiple widgets
- Remove individual widgets
- Clear all

### 5. ERD (Entity Relationship Diagram)
- Auto-generate visual diagram from schema relationships
- Shows tables with columns, types, PK/FK indicators
- Visual relationship lines between tables
- Per-connection ERD generation

### 6. Terminal
- Raw SQL CLI in browser
- Commands: help, clear, show tables, show databases, desc [table], use [connection]
- Execute any SQL query inline
- Command history (arrow up/down)
- Results rendered as table

### 7. Templates
- Pre-built query patterns (Top N, Find Duplicates, Count by Group, etc.)
- Fillable parameters ({{table}}, {{column}}, etc.)
- Apply to SQL Editor with one click
- Organized by category

### 8. Compare
- Select two connections for schema comparison
- Identify: tables only in source, only in target, or different
- Column-level comparison (missing columns, type differences)
- Visual status badges

### 9. Saved Queries
- Save frequently used queries with name
- Organize in folder structure
- Load saved queries into SQL Editor
- Delete saved queries
- Persisted in localStorage

### 10. Import Data
- Drag & drop file upload zone
- Supports CSV, JSON formats
- Preview imported data before committing
- Choose target connection and table name
- Auto-creates table schema from imported data

### 11. History
- Log all executed queries with timestamps
- Search/filter history
- Re-run queries from history
- Clear history

### 12. Admin Panel (Sub-tabs)
- **Users** — Add/remove users, assign roles (admin/editor/viewer), enable/disable
- **Audit Log** — Track all queries (who, when, duration, connection)
- **Backup/Restore** — Export full SQL dump, restore from .sql file
- **Data Generator** — Generate fake/test data for any table (configurable count)
- **Migration Builder** — Compare 2 schemas, generate ALTER SQL for sync
- **Stored Procedures** — Create, view, execute stored procedures
- **Notifications/Alerts** — Set rules, detect anomalies (e.g. rowCount > threshold)
- **Plugins** — Install/uninstall extensions, manage add-ons

## Hidden Features (Code exists, tabs hidden)
- **Form Query Builder** — Non-technical query building via dropdowns
- **Chart Builder** — Bar/Line/Pie/Scatter from query results (Chart.js)

## Shared Features (All tabs)
- Connections sidebar (add/edit/test/delete)
- Dark/Light theme toggle with persistence
- Resizable panels (all dividers draggable)
- Toast notifications
- Splash screen on login

## Supported Databases
- **Relational/SQL:** MySQL, MariaDB, PostgreSQL, SQLite, Oracle, MSSQL, IBM DB2, Firebird, H2/HSQLDB
- **Analytical (OLAP):** Snowflake, ClickHouse, Teradata, Greenplum, Vertica, Apache Hive, Apache Spark
- **Cloud:** AWS (Redshift, Athena, DynamoDB), GCP (BigQuery, Spanner, Cloud SQL), Azure (SQL DB, Synapse), CockroachDB
- **NoSQL:** MongoDB, Cassandra, Redis, Couchbase, InfluxDB, Neo4j
- **Virtual:** Saved join results as virtual connections

## Architecture
```
ydb/
├── index.html
├── css/main.css
├── js/                          (40 modules)
│   ├── config.js               Constants, DB types, ports
│   ├── state.js                Centralized state management
│   ├── ui.js                   Theme, toast, resize, pagination, tabs
│   ├── auth.js                 Login, logout, splash
│   ├── connections.js          Connection CRUD
│   ├── explorer.js             Tree view + data viewer
│   ├── query-engine.js         SQL parser/executor
│   ├── builder.js              Visual query builder + canvas
│   ├── sql-editor.js           SQL editor + tabs
│   ├── history.js              Query history
│   ├── export.js               CSV/JSON/Excel export
│   ├── data-editor.js          Inline CRUD editing
│   ├── ddl-viewer.js           CREATE TABLE generation
│   ├── erd.js                  Entity relationship diagram
│   ├── structure-editor.js     Table structure modification
│   ├── saved-queries.js        Saved queries/snippets
│   ├── autocomplete.js         SQL autocomplete
│   ├── explain.js              Query execution plan
│   ├── filtering.js            Data filtering & sorting
│   ├── compare.js              Database schema comparison
│   ├── import.js               Data import (CSV/JSON)
│   ├── schedule.js             Scheduled queries
│   ├── diff.js                 Query result diff
│   ├── masking.js              Data masking
│   ├── collab.js               Collaboration/sharing
│   ├── charts.js               Chart builder (hidden)
│   ├── dashboard.js            Dashboard widgets
│   ├── templates.js            Query templates
│   ├── data-generator.js       Fake data generation
│   ├── migration.js            Schema migration builder
│   ├── audit.js                Audit log
│   ├── users.js                User management
│   ├── backup.js               Backup/restore
│   ├── form-builder.js         Form query builder (hidden)
│   ├── stored-procs.js         Stored procedures
│   ├── terminal.js             SQL terminal/console
│   ├── notifications.js        Alert notifications
│   ├── plugins.js              Plugin architecture
│   ├── mock-data.js            Sample data
│   └── app.js                  Entry point
├── assets/
│   └── logo.png
└── requirements.md
```

## Technical Stack
- HTML5, CSS3, Vanilla JavaScript (no build tools)
- Tailwind CSS via CDN
- DaisyUI component library via CDN
- Lucide icons via CDN
- Chart.js via CDN (for data visualization)
- No server-side runtime required
- Modular architecture with YDB namespace
- localStorage for persistence

## Branding
- **Name:** yDB
- **Slogan:** Tame any database.
- **Logo:** Highland bull/yak pixel art (red circle background)

## Future Considerations
- Replace mock data with real database driver connections (WebSocket backend)
- Implement Monaco editor for proper SQL syntax highlighting
- Add user authentication (JWT/OAuth)
- Implement real-time collaboration via WebSocket
- Bundle with Vite for production deployment
- Add unit and integration tests
- Real scheduled query execution via backend cron
- Add data visualization dashboard improvements
- Database schema migration versioning
- API access for external integrations
