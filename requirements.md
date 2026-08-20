# yDB - Tame any database.

## Overview
yDB is a production-grade, web-based database management platform with multi-connection support, visual query builder with real cross-database join capabilities, and enterprise security features. Architecturally comparable to AWS RDS + IAM + CloudTrail unified in one tool.

## Target Users
- Developers managing databases during development
- DBAs needing a lightweight universal tool
- Non-technical teams who need data access without CLI
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
- **Adapter Pattern**: `BaseAdapter` → `connect()`, `query()`, `getSchema()`, `disconnect()`
- **Connection Pool Manager**: Per-connection caching, 5-min idle timeout, max 50 pools, LRU eviction
- **Federated Query Engine**: Cross-database joins via in-memory merge
- **SSH Tunnel Service**: Port forwarding for private databases
- **Server-Side Masking**: Role-based (admin=none, editor=partial, viewer=full)
- **JWT Auth**: Access tokens + 30-day refresh tokens
- **RBAC**: admin/editor/viewer enforced on every endpoint
- **AES-256 Encryption**: Stored credentials encrypted at rest
- **Audit Log**: Append-only, every query logged with user/duration/connection
- **Backup Scheduler**: Automated dumps every 6 hours
- **Structured Logging**: JSON format for observability
- **Prometheus Metrics**: `/metrics` endpoint for monitoring
- **SSE Streaming**: Real-time query result streaming for large datasets
- **Rate Limiting**: Per-IP throttling

### Frontend (Vanilla JS, 41 modules)
- **Explorer**: Tree view + data viewer + inline editing
- **Visual Builder**: Drag-drop cross-DB joins with federated execution
- **SQL Editor**: Auto-complete, multi-tab, Ctrl+Enter execution
- **Terminal**: CLI-style interface with command history
- **Admin Panel**: Users, Audit, Backup, Data Gen, Migration, Procedures, Alerts, Plugins

### Deployment
- Docker Compose: yDB + PostgreSQL + Redis
- GitHub Actions CI: lint → db init → health check → Docker build
- Environment-based config (`.env`)

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | No | JWT login |
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/refresh | No | Refresh token |
| GET | /api/auth/me | Yes | Current user |
| GET | /api/connections | Yes | List connections |
| POST | /api/connections | Yes | Create connection |
| PUT | /api/connections/:id | Yes | Update connection |
| DELETE | /api/connections/:id | Yes | Delete connection |
| POST | /api/connections/:id/test | Yes | Test connection |
| POST | /api/query/execute | Yes | Execute SQL |
| POST | /api/federated/execute | Yes | Cross-DB join |
| GET | /api/explorer/:id/schema | Yes | Get schema |
| GET | /api/explorer/:id/tables/:t/data | Yes | Get table data |
| GET | /api/stream/query | Yes | SSE streaming |
| POST | /api/export/csv | Yes | Export CSV |
| POST | /api/export/json | Yes | Export JSON |
| POST | /api/import/parse | Yes | Parse uploaded file |
| GET | /api/users | Admin | List users |
| POST | /api/users | Admin | Create user |
| PATCH | /api/users/:id | Admin | Update user |
| DELETE | /api/users/:id | Admin | Delete user |
| GET | /api/audit | Yes | Query audit log |
| GET | /api/backup/list | Admin | List backups |
| POST | /api/backup/create | Admin | Create backup |
| GET | /api/pool/stats | Admin | Connection pool stats |
| GET | /api/metrics | Admin | App metrics (JSON) |
| GET | /metrics | No | Prometheus metrics |

## Security Model
- Credentials never stored in browser (localStorage or state)
- JWT tokens with short expiry + refresh
- Server-side masking enforced regardless of API call method
- AES-256 encryption for stored database passwords
- RBAC checked on every endpoint before execution
- Audit log immutable by non-admin roles
- Rate limiting prevents abuse

## Quick Start

### Docker (Recommended)
```bash
docker compose up -d
# → http://localhost:3000
```

### Manual
```bash
cd server && npm install
cp .env.example .env  # Edit credentials
npm run db:init
npm run db:seed       # admin / admin123
npm start
```

## License
MIT
