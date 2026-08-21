# yDB - Tame any database.

## Overview
yDB is a production-grade, web-based database management platform with multi-connection support, visual query builder with real cross-database join capabilities, AI-powered BI Copilot (Text-to-SQL), and enterprise security features. Architecturally comparable to AWS RDS + IAM + CloudTrail + QuickSight Q unified in one tool.

## Target Users
- Developers managing databases during development
- DBAs needing a lightweight universal tool
- Non-technical teams who need data access without CLI — just ask in plain language
- Business managers who want analytics without learning SQL
- DevOps teams managing multi-cloud database infrastructure

## Supported Databases (12 Types, Real Drivers)

| Category | Database | Driver | Status |
|----------|----------|--------|--------|
| Relational | PostgreSQL | `pg` | Full |
| Relational | MySQL / MariaDB | `mysql2` | Full |
| Relational | SQL Server | `mssql` | Full |
| Relational | SQLite | `sql.js` | Full |
| NoSQL | MongoDB | `mongodb` | Full |
| NoSQL | Redis | `ioredis` | Full |
| Graph | Neo4j | `neo4j-driver` | Full |
| Analytical | ClickHouse | `@clickhouse/client` | Full |
| Cloud | AWS DynamoDB | `@aws-sdk` | Full |
| Cloud | AWS Redshift | `pg` (compatible) | Full |
| Cloud | Azure SQL / Synapse | `mssql` | Full |
| Cloud | Google Cloud SQL | `pg` / `mysql2` | Full |

## Architecture

### Backend (Node.js + Express)
- **Adapter Pattern**: `BaseAdapter` → `connect()`, `query()`, `getSchema()`, `disconnect()`, `cancel()`
- **Connection Pool Manager**: Per-connection caching, 5-min idle timeout, max 50 pools, LRU eviction
- **Federated Query Engine**: Cross-database joins via DuckDB (9ms 2-way, 13ms 3-way)
- **NLQ Engine (Text-to-SQL)**: Natural language → SQL translation with schema awareness, supports BM/EN
- **SSH Tunnel Service**: Port forwarding for private databases
- **Server-Side Masking**: Role-based (admin=none, editor=partial, viewer=full)
- **JWT Auth**: Access tokens + 30-day refresh tokens, forced password change on first login
- **RBAC**: admin/editor/viewer enforced on every endpoint
- **AES-256 Encryption**: Stored credentials encrypted at rest (no hardcoded fallback keys)
- **Immutable Audit Log**: INSERT-only at DB level, PostgreSQL rules prevent UPDATE/DELETE
- **Backup & Restore**: Scheduled automated backups with dry-run restore preview
- **Password Policy**: Min 12 chars, uppercase, lowercase, numbers, special characters
- **Per-User Rate Limiting**: Role-based multipliers (admin 3x, editor 2x, viewer 1x)
- **Query Cancellation**: Native cancel signals (pg_cancel_backend, KILL QUERY)
- **Structured Logging**: JSON format for observability
- **Prometheus Metrics**: `/metrics` endpoint for monitoring
- **SSE Streaming**: Real-time query result streaming with execution tracking
- **Pluggable AI Backend**: Built-in heuristic + Amazon Bedrock + OpenAI compatible

### Frontend (Vanilla JS, 42+ modules)
- **Explorer**: Tree view + data viewer + inline editing
- **Visual Builder**: Drag-drop cross-DB joins with federated execution
- **SQL Editor**: Auto-complete, multi-tab, Ctrl+Enter execution
- **BI Copilot**: Chat-based natural language query interface with chart visualization
- **Terminal**: CLI-style interface with command history
- **Admin Panel**: Users, Audit, Backup, Data Gen, Migration, Procedures, Alerts, Plugins

### AI / NLQ Layer (BI Copilot)
- **Text-to-SQL**: User types business question → AI generates SQL → execute → visualize
- **Schema-Aware**: Reads connected database schema for context-accurate SQL generation
- **Dynamic Suggestions**: Analyzes schema to suggest relevant queries per table
- **Smart Visualization**: Auto-detects appropriate chart type (number, bar, line, pie, table)
- **Pluggable Provider**: Built-in pattern matching, Amazon Bedrock (Claude), OpenAI API
- **Cross-table Detection**: Identifies JOIN relationships via foreign keys

### Deployment
- Docker Compose: yDB + PostgreSQL + Redis (secrets required, no defaults)
- GitHub Actions CI: test → lint → db init → health check → Docker build
- Environment-based config (`.env`) with mandatory secrets validation

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | No | JWT login |
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/change-password | Yes | Change password (enforces policy) |
| POST | /api/auth/refresh | No | Refresh token |
| GET | /api/auth/me | Yes | Current user |
| GET | /api/auth/setup-status | No | Check first-run status |
| GET | /api/connections | Yes | List connections |
| POST | /api/connections | Yes | Create connection |
| POST | /api/connections/test | Yes | Test connection (without saving) |
| PUT | /api/connections/:id | Yes | Update connection |
| DELETE | /api/connections/:id | Yes | Delete connection |
| POST | /api/connections/:id/test | Yes | Test saved connection |
| POST | /api/query/execute | Yes | Execute SQL (returns executionId) |
| POST | /api/query/:execId/cancel | Yes | Cancel running query |
| GET | /api/query/executions | Yes | List executions |
| POST | /api/federated/execute | Yes | Cross-DB join (DuckDB) |
| **POST** | **/api/nlq/ask** | **Yes** | **Natural language → SQL → results** |
| **POST** | **/api/nlq/suggest** | **Yes** | **Get suggested questions** |
| GET | /api/explorer/:id/schema | Yes | Get schema |
| GET | /api/explorer/:id/tables/:t/data | Yes | Get table data |
| GET | /api/stream/query | Yes | SSE streaming |
| POST | /api/stream/cancel | Yes | Cancel stream |
| POST | /api/export/csv | Yes | Export CSV |
| POST | /api/export/json | Yes | Export JSON |
| POST | /api/import/parse | Yes | Parse uploaded file |
| GET | /api/users | Admin | List users |
| POST | /api/users | Admin | Create user |
| PATCH | /api/users/:id | Admin | Update user |
| DELETE | /api/users/:id | Admin | Delete user |
| GET | /api/audit | Yes | Query audit log |
| GET | /api/audit/export | Admin | Export audit logs |
| GET | /api/audit/stats | Admin | Audit statistics |
| GET | /api/backup/list | Admin | List backups |
| POST | /api/backup/create | Admin | Create backup |
| POST | /api/backup/restore | Admin | Restore (supports dryRun) |
| GET | /api/pool/stats | Admin | Connection pool stats |
| GET | /api/metrics | Admin | App metrics (JSON) |
| GET | /metrics | No | Prometheus metrics |

## Security Model
- No default credentials — admin password randomly generated on first setup
- Server refuses to start without JWT_SECRET and ENCRYPTION_KEY
- JWT tokens with forced password change on first login
- Server-side masking enforced regardless of API call method
- AES-256 encryption for stored database passwords
- RBAC checked on every endpoint before execution
- Immutable audit log — PostgreSQL rules prevent DELETE/UPDATE at DB level
- Per-user rate limiting with role-based overrides
- Password policy enforced server-side (12+ chars, complexity rules)
- Query cancellation with native DB signals

## Quick Start

### Docker (Recommended)
```bash
# Generate secrets first
export JWT_SECRET=$(openssl rand -hex 64)
export ENCRYPTION_KEY=$(openssl rand -hex 16)
export PG_PASSWORD=$(openssl rand -base64 24)

docker compose up -d
# Check logs for initial admin password: docker compose logs ydb
# → http://localhost:3000
```

### Manual
```bash
cd server && npm install
cp .env.example .env  # REQUIRED: set JWT_SECRET, ENCRYPTION_KEY, PG_PASSWORD
npm run db:init       # Create schema + immutable audit log
npm run db:seed       # Create admin (random password printed once)
npm start             # http://localhost:3000
```

## BI Copilot — Text-to-SQL (NLQ)

### How it works:
1. User opens "BI Copilot" tab
2. Selects a connected database from dropdown
3. Dynamic suggestions appear based on actual schema analysis
4. User types a business question in plain English
5. System reads database schema for context
6. Generates appropriate SQL query using pattern matching or LLM
7. Executes against the connected database via adapter
8. Returns results as table, chart, or single number

### Supported question patterns:
| Pattern | Example | Output |
|---|---|---|
| Count | "How many users?" | Single number |
| Sum | "Total amount from transactions" | Single number |
| Trend | "Monthly trend of transactions" | Bar chart |
| Breakdown | "Breakdown of users by status" | Pie chart |
| Top-N | "Top 10 merchants by fee" | Bar chart |
| Bottom-N | "Bottom 5 by balance" | Bar chart |
| Recent | "Latest 20 records" | Table |
| Average | "Average transaction amount" | Number |
| Max/Min | "Highest deposit amount" | Number |
| Search | "Find user john" | Table |
| Time filter | "Transactions this month" | Filtered |
| Status filter | "Show pending payments" | Filtered |
| Compare | "Compare by category" | Bar chart |

### Dynamic Suggestions:
The suggestion bar analyzes your actual database schema and generates relevant questions:
- Tables with amount/price columns get SUM and TOP-N suggestions
- Tables with date columns get trend and recent suggestions
- Tables with status/type columns get breakdown suggestions
- All tables get count suggestions

### AI Provider Configuration:
```env
# Built-in (no API key needed — pattern matching)
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

## License

This project is open-source software licensed under the [MIT License](LICENSE).

All dependencies used are MIT or Apache-2.0 licensed — no proprietary or GPL dependencies.
