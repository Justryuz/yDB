# yDB - Tame any database.

A production-grade, open-source database management platform with cross-database joins powered by DuckDB, supporting 12+ database types simultaneously.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Cross-Database Joins** — Join tables from MySQL + PostgreSQL + MongoDB in one query via DuckDB engine (9ms for 2-way, 13ms for 3-way joins)
- **12 Database Types** — PostgreSQL, MySQL, MongoDB, SQL Server, SQLite, Redis, Neo4j, ClickHouse, DynamoDB, Redshift, Azure SQL, Cloud SQL
- **Visual Query Builder** — Drag-drop tables, auto-detect joins, generate SQL
- **Built-in API Client** — Postman-like HTTP client with collections and auth
- **Server-Side Security** — JWT auth, RBAC, AES-256 encrypted credentials, data masking
- **SSH Tunnel** — Connect to private databases behind firewalls
- **Real-Time Streaming** — SSE for long-running query results
- **Observability** — Prometheus metrics, structured logging, audit trail

## Quick Start

### Docker (Recommended)
```bash
git clone https://github.com/Justryuz/yDB.git
cd yDB
docker compose up -d
```
Open **http://localhost:3000** — Login: `admin` / `admin123`

### Manual Setup
```bash
git clone https://github.com/Justryuz/yDB.git
cd yDB/server
npm install
cp .env.example .env    # Edit with your PostgreSQL credentials
npm run db:init         # Create schema
npm run db:seed         # Create admin user
npm start               # http://localhost:3000
```

### Custom Port
```bash
PORT=9090 npm start
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Vanilla JS, 42 modules, YDB namespace)       │
│  Tailwind CSS + DaisyUI + Lucide + Chart.js (CDN)       │
├─────────────────────────────────────────────────────────┤
│  Express.js Backend                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐    │
│  │ Auth/JWT │ │   RBAC   │ │  Data Masking        │    │
│  └──────────┘ └──────────┘ └──────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Adapter Pattern (BaseAdapter interface)          │   │
│  │  PostgreSQL │ MySQL │ MongoDB │ MSSQL │ Redis    │   │
│  │  Neo4j │ SQLite │ ClickHouse │ DynamoDB          │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  DuckDB Federated Engine (cross-DB joins)         │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐    │
│  │ Pool Mgr │ │SSH Tunnel│ │  Backup / Metrics    │    │
│  └──────────┘ └──────────┘ └──────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL (app DB) │ Redis (cache/queue) │ DuckDB     │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | License |
|-------|-----------|---------|
| Frontend | Vanilla JS, Tailwind CSS, DaisyUI, Chart.js | MIT |
| Backend | Node.js 18+, Express.js | MIT |
| Federated Engine | DuckDB (embedded OLAP) | MIT |
| App Database | PostgreSQL 16 | PostgreSQL License |
| Cache/Queue | Redis 7 | BSD |
| Auth | JWT + bcrypt | MIT |
| DB Drivers | pg, mysql2, mongodb, mssql, ioredis, neo4j-driver, sql.js, @clickhouse/client, @aws-sdk | MIT/Apache-2.0 |
| Security | helmet, AES-256, ssh2 | MIT |
| Deploy | Docker, GitHub Actions | - |

## Supported Databases

| Database | Driver | Features |
|----------|--------|----------|
| PostgreSQL | `pg` | Full schema, PK/FK detection, query execution |
| MySQL / MariaDB | `mysql2` | Full schema, DESCRIBE support |
| MongoDB | `mongodb` | Collection scan, schema inference |
| SQL Server | `mssql` | INFORMATION_SCHEMA queries |
| SQLite | `sql.js` | Pure JS, file-based, PRAGMA support |
| Redis | `ioredis` | Key commands, ping |
| Neo4j | `neo4j-driver` | Cypher queries, label detection |
| ClickHouse | `@clickhouse/client` | HTTP interface, system.columns |
| AWS DynamoDB | `@aws-sdk` | Scan, ListTables, DescribeTable |
| AWS Redshift | `pg` | PostgreSQL wire-compatible |
| Azure SQL / Synapse | `mssql` | Same as SQL Server |
| Google Cloud SQL | `pg` / `mysql2` | PostgreSQL or MySQL compatible |

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (returns JWT) |
| POST | `/api/auth/refresh` | Refresh token |
| GET | `/api/connections` | List connections |
| POST | `/api/connections` | Create connection |
| POST | `/api/connections/:id/test` | Test connection |
| POST | `/api/query/execute` | Execute SQL |
| POST | `/api/federated/execute` | Cross-DB join (DuckDB) |
| GET | `/api/explorer/:id/schema` | Get database schema |
| GET | `/api/stream/query` | SSE streaming results |
| GET | `/api/pool/stats` | Connection pool stats |
| GET | `/metrics` | Prometheus metrics |

## Security

- Credentials encrypted at rest (AES-256-CBC)
- JWT with short-lived access + 30-day refresh tokens
- RBAC: `admin` / `editor` / `viewer` enforced server-side
- Server-side data masking (sensitive columns auto-detected)
- SSH tunnel support for private databases
- Rate limiting (1000 req / 15 min)
- Helmet security headers

## Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

## License

This project is open-source software licensed under the [MIT License](LICENSE).

---

**yDB** — Tame any database.
