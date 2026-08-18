# yDB - Tame any database.

A powerful, browser-based database management tool with multi-connection support, visual query builder, and cross-database join capabilities.

## Quick Start

```bash
# No installation required. Just serve the files:
python -m http.server 8080

# Open in browser:
http://localhost:8080
```

**Login:** `admin` / `password`

## Features

### Core
- **Multi-Database Connections** — Connect to MySQL, PostgreSQL, MongoDB, Oracle, SQL Server, and 25+ database types simultaneously
- **Visual Query Builder** — Drag tables from different databases onto a canvas, auto-detect joins, generate federated SQL
- **SQL Editor** — Auto-complete, multiple tabs, formatting, Ctrl+Enter execution
- **Database Explorer** — Tree navigation, inline data editing, DDL viewer, structure editor

### Data Tools
- **Cross-Database Joins** — Join tables across MySQL, PostgreSQL, MongoDB in one query
- **Export** — CSV, JSON, Excel from any results view
- **Import** — Drag & drop CSV/JSON files to create tables
- **Data Generator** — Generate realistic fake data for testing
- **Data Masking** — Auto-mask sensitive columns (passwords, emails)

### Visualization & Reporting
- **Query Templates** — Pre-built patterns (Top N, Duplicates, Aggregations)

### Administration
- **User Management** — Roles (admin/editor/viewer)
- **Audit Log** — Track all query execution
- **Backup/Restore** — SQL dump export and import
- **Schema Compare** — Diff two databases, generate migration SQL
- **Stored Procedures** — Create, manage, execute
- **Scheduled Queries** — Set intervals, detect anomalies
- **Plugins** — Extensible architecture for add-ons

### Developer Experience
- **Terminal** — CLI-style SQL console in browser
- **Query History** — Search, filter, re-run past queries
- **Saved Queries** — Bookmark with folders
- **Query Diff** — Compare two query results side-by-side
- **Resizable Panels** — All dividers are draggable
- **Dark/Light Theme** — Toggle with persistence

## Supported Databases

| Category | Databases |
|----------|-----------|
| Relational | MySQL, MariaDB, PostgreSQL, SQLite, Oracle, MSSQL, IBM DB2, Firebird, H2 |
| Analytical | Snowflake, ClickHouse, Teradata, Greenplum, Vertica, Hive, Spark |
| Cloud | AWS Redshift/Athena/DynamoDB, GCP BigQuery/Spanner/Cloud SQL, Azure SQL/Synapse, CockroachDB |
| NoSQL | MongoDB, Cassandra, Redis, Couchbase, InfluxDB, Neo4j |

## Architecture

```
ydb/
├── index.html              Single-page application
├── css/main.css            Custom styles
├── js/                     40 modular JavaScript files
│   ├── config.js           Constants & DB type definitions
│   ├── state.js            Centralized state management
│   ├── ui.js               Theme, tabs, resize, pagination
│   ├── auth.js             Authentication & splash screen
│   ├── connections.js      Connection CRUD
│   ├── explorer.js         Tree view & data viewer
│   ├── query-engine.js     SQL parser & executor
│   ├── builder.js          Visual query builder & canvas
│   ├── sql-editor.js       Editor, tabs, execution
│   ├── history.js          Query history
│   ├── export.js           CSV/JSON/Excel export
│   ├── data-editor.js      Inline CRUD
│   ├── ddl-viewer.js       DDL generation
│   ├── erd.js              ER diagrams
│   ├── structure-editor.js Column management
│   ├── saved-queries.js    Bookmarked queries
│   ├── autocomplete.js     SQL suggestions
│   ├── explain.js          Execution plans
│   ├── filtering.js        Sort & filter
│   ├── compare.js          Schema diff
│   ├── import.js           File import
│   ├── schedule.js         Query scheduling
│   ├── diff.js             Result comparison
│   ├── masking.js          Data masking
│   ├── collab.js           Sharing & collaboration
│   ├── charts.js           Chart builder
│   ├── dashboard.js        Dashboard widgets
│   ├── templates.js        Query templates
│   ├── data-generator.js   Fake data generation
│   ├── migration.js        Migration SQL builder
│   ├── audit.js            Audit logging
│   ├── users.js            User management
│   ├── backup.js           Backup & restore
│   ├── form-builder.js     Form-based queries
│   ├── stored-procs.js     Stored procedures
│   ├── terminal.js         SQL terminal
│   ├── notifications.js    Alert system
│   ├── plugins.js          Plugin manager
│   ├── mock-data.js        Sample data
│   └── app.js              Entry point
├── assets/
│   └── logo.png
├── requirements.md         Full specification
└── README.md
```

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES5), HTML5, CSS3
- **UI Framework:** Tailwind CSS + DaisyUI (via CDN)
- **Icons:** Lucide Icons (via CDN)
- **Charts:** Chart.js (via CDN)
- **Build Tools:** None required
- **Server:** Any static file server (Python, Nginx, Apache, etc.)

## Design Principles

- **Zero Dependencies** — No npm, no node_modules, no build step
- **Modular Architecture** — 40 self-contained modules under `YDB` namespace
- **Progressive Enhancement** — Works by opening index.html directly
- **Persistence** — localStorage for connections, history, preferences
- **Performance** — Event delegation, debounced inputs, no memory leaks

## Development

```bash
# Serve locally
python -m http.server 8080

# Or use any static server
npx serve .
php -S localhost:8080
```

No build step. Edit files and refresh browser.

## Production Roadmap

- [ ] Replace mock data with real WebSocket database connections
- [ ] Integrate Monaco Editor for SQL syntax highlighting
- [ ] Add JWT/OAuth authentication
- [ ] Real-time collaboration via WebSocket
- [ ] Bundle with Vite for optimized production builds
- [ ] Add comprehensive test suite
- [ ] Docker deployment support
- [ ] API access for external integrations

## License

This project is licensed under the [MIT License](LICENSE).

---

**yDB** — Tame any database.
