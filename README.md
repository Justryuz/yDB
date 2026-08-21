# yDB - Tame any database.

A production-grade, open-source database management platform with cross-database joins powered by DuckDB, supporting 12+ database types simultaneously.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Cross-Database Joins** — Join tables from MySQL + PostgreSQL + MongoDB in one query via DuckDB engine (9ms for 2-way, 13ms for 3-way joins)
- **12 Database Types** — PostgreSQL, MySQL, MongoDB, SQL Server, SQLite, Redis, Neo4j, ClickHouse, DynamoDB, Redshift, Azure SQL, Cloud SQL
- **BI Copilot (Text-to-SQL)** — Ask business questions in plain language (BM/EN), get SQL + results + charts instantly
- **Visual Query Builder** — Drag-drop tables, auto-detect joins, generate SQL
- **Built-in API Client** — Postman-like HTTP client with collections and auth
- **Server-Side Security** — JWT auth, RBAC, AES-256 encrypted credentials, immutable audit log, per-user rate limiting
- **Query Cancellation** — Cancel running queries mid-execution from the UI; native signal sent to the database
- **SSH Tunnel** — Connect to private databases behind firewalls
- **Real-Time Streaming** — SSE for long-running query results with execution tracking
- **Backup & Restore** — Scheduled automated backups with dry-run restore preview
- **Observability** — Prometheus metrics, structured logging, immutable audit trail

## Quick Start

### Docker (Recommended)
```bash
git clone https://github.com/Justryuz/yDB.git
cd yDB
# Generate required secrets FIRST:
cp server/.env.example server/.env
# Edit server/.env — set JWT_SECRET, ENCRYPTION_KEY, PG_PASSWORD
docker compose up -d
```
Open **http://localhost:3000** — The initial admin password is printed to logs on first run. Check with `docker compose logs server`.

> **Important:** There is no default password. The admin password is randomly generated on first `db:seed` run and must be changed on first login.

### Manual Setup
```bash
git clone https://github.com/Justryuz/yDB.git
cd yDB/server
npm install
cp .env.example .env    # REQUIRED: set JWT_SECRET, ENCRYPTION_KEY, PG_PASSWORD
npm run db:init         # Create schema + immutable audit log
npm run db:seed         # Create admin user (prints one-time password)
npm start               # http://localhost:3000
```

The server **will not start** without `JWT_SECRET` and `ENCRYPTION_KEY` set. See [SECURITY.md](SECURITY.md) for details.

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
│  │  Per-User Rate Limiting (role-based multipliers)  │   │
│  └──────────────────────────────────────────────────┘   │
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
│  ┌──────────────────────────────────────────────────┐   │
│  │  Immutable Audit Log (INSERT-only, DB rules)      │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL (app DB) │ Redis (cache/queue) │ DuckDB     │
└─────────────────────────────────────────────────────────┘
```

## Security

yDB is hardened for production deployment. See [SECURITY.md](SECURITY.md) for full details.

### Key Security Features

- **No Default Credentials** — Admin password is randomly generated on first setup and must be changed on first login.
- **Required Secrets** — Server refuses to boot without `JWT_SECRET` and `ENCRYPTION_KEY` explicitly set (no hardcoded fallbacks).
- **Password Policy** — Enforced server-side: minimum 12 characters, uppercase, lowercase, numbers, and special characters required.
- **Immutable Audit Log** — PostgreSQL rules prevent UPDATE/DELETE on the audit table. Even DB-level tampering is blocked. Admin can read and export but never modify.
- **Per-User Rate Limiting** — Rate limits keyed on user identity, not global. One user hitting limits does not affect others. Role-based multipliers (admin 3x, editor 2x, viewer 1x).
- **Credentials Encrypted at Rest** — AES-256-CBC with scrypt-derived key.
- **JWT with Short-Lived Tokens** — Access tokens (7d) + refresh tokens (30d).
- **RBAC** — `admin` / `editor` / `viewer` enforced on every endpoint.
- **Server-Side Data Masking** — Sensitive columns auto-detected and masked based on role.
- **SSH Tunnel** — Connect to private databases behind firewalls.
- **Helmet Security Headers** — CSP, HSTS, etc.

### Backup & Restore

- Automated scheduled backups (configurable interval, default every 6 hours)
- JSON format for reliable restoration
- Restore with **dry-run preview** (shows what will change before applying)
- Automatic cleanup of backups beyond retention period
- All backup/restore actions logged to immutable audit trail

### Query Cancellation

- Every query execution gets a unique `executionId`
- `POST /api/query/:executionId/cancel` sends native cancel signal to the database
- PostgreSQL: `pg_cancel_backend()` / MySQL: `KILL QUERY`
- For unsupported backends: connection is destroyed to abort the query
- Cancelled queries are logged to the audit trail with status `cancelled`

## BI Copilot — Text-to-SQL (NLQ)

Natural language interface for business users who don't know SQL:

```
User: "How many users registered this month?"
  -> AI generates SQL:
  SELECT COUNT(*) AS total FROM users
  WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
  -> Executes against connected database
  -> Returns: 33 (displayed as number card)
```

- Ask questions in plain English — get SQL + results + charts
- Schema-aware: reads connected database to generate accurate queries
- Smart chart selection: number, bar, line, pie, or table
- Dynamic suggestions generated from your actual database schema
- Pluggable AI backend: built-in heuristic, Amazon Bedrock (Claude), or OpenAI
- No SQL knowledge needed — business users can self-serve analytics

### Supported Question Patterns

| Pattern | Example | Output |
|---|---|---|
| Count | "How many users?" | Single number |
| Sum | "Total revenue this month" | Single number |
| Trend | "Monthly transaction trend" | Bar/line chart |
| Breakdown | "Breakdown by status" | Pie chart |
| Top-N | "Top 10 merchants by amount" | Bar chart |
| Recent | "Latest 20 transactions" | Table |
| Search | "Find user john" | Table |
| Time filter | "Orders last 30 days" | Filtered results |
| Status filter | "Show pending payments" | Filtered results |

### AI Provider Configuration

```env
# Built-in heuristic (default, no API key needed)
NLQ_PROVIDER=builtin

# Amazon Bedrock (Claude)
NLQ_PROVIDER=bedrock
NLQ_MODEL=anthropic.claude-3-haiku-20240307-v1:0
NLQ_REGION=us-east-1

# OpenAI compatible
NLQ_PROVIDER=openai
NLQ_API_KEY=sk-...
NLQ_MODEL=gpt-4o-mini
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
| Security | helmet, AES-256, ssh2, per-user rate limiting | MIT |
| Testing | Jest + Supertest | MIT |
| Deploy | Docker, GitHub Actions CI | - |

## Supported Databases

| Database | Driver | Features |
|----------|--------|----------|
| PostgreSQL | `pg` | Full schema, PK/FK detection, query execution, cancel |
| MySQL / MariaDB | `mysql2` | Full schema, DESCRIBE support, KILL QUERY cancel |
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
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/change-password` | Change password (enforces policy) |
| POST | `/api/auth/refresh` | Refresh token |
| GET | `/api/auth/setup-status` | Check if initial setup is complete |
| GET | `/api/connections` | List connections |
| POST | `/api/connections` | Create connection |
| POST | `/api/connections/:id/test` | Test connection |
| POST | `/api/query/execute` | Execute SQL (returns executionId) |
| POST | `/api/query/:executionId/cancel` | Cancel running query |
| GET | `/api/query/executions` | List recent executions |
| POST | `/api/federated/execute` | Cross-DB join (DuckDB) |
| **POST** | **`/api/nlq/ask`** | **BI Copilot — natural language → SQL → results** |
| **POST** | **`/api/nlq/suggest`** | **Get suggested questions for a connection** |
| GET | `/api/explorer/:id/schema` | Get database schema |
| GET | `/api/stream/query` | SSE streaming results |
| POST | `/api/stream/cancel` | Cancel streaming query |
| GET | `/api/audit` | View audit logs (paginated) |
| GET | `/api/audit/export` | Export audit logs (admin) |
| GET | `/api/audit/stats` | Audit statistics (admin) |
| GET | `/api/backup/list` | List backups (admin) |
| POST | `/api/backup/create` | Create backup (admin) |
| POST | `/api/backup/restore` | Restore from backup (admin, supports dryRun) |
| GET | `/api/pool/stats` | Connection pool stats (admin) |
| GET | `/metrics` | Prometheus metrics |

## Testing

```bash
cd server
npm test           # Run all tests with coverage
npm run test:ci    # CI mode (used by GitHub Actions)
```

The test suite covers:
- Authentication & authorization middleware
- Password policy enforcement
- Per-user rate limiting (isolation, role multipliers, 429 responses)
- Audit log immutability (no UPDATE/DELETE paths)
- DB adapter query/schema/error/cancel paths
- Backup creation, dry-run restore, file validation
- Data masking logic

CI blocks PRs with failing tests. Coverage threshold: 60%.

## Production Checklist

See [SECURITY.md](SECURITY.md) for the complete checklist. Key items:

1. Set `JWT_SECRET` (≥32 chars, cryptographically random)
2. Set `ENCRYPTION_KEY` (32 chars)
3. Set strong `PG_PASSWORD`
4. Run `db:init` + `db:seed`, save the one-time password
5. Change admin password on first login
6. Place behind TLS reverse proxy (Caddy/Nginx + Let's Encrypt)
7. Configure backup target and verify scheduled backups work
8. Review rate limits for your expected load

## Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing`)
3. Run tests (`cd server && npm test`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing`)
6. Open a Pull Request

CI will run tests automatically. PRs with failing tests will not be merged.

## License

This project is open-source software licensed under the [MIT License](LICENSE).

---

**yDB** — Tame any database.
