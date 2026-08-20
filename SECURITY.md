# Security Policy — yDB

## Required Secrets

yDB **will not start** without these environment variables. There are no fallback defaults.

| Variable | Purpose | Min Length |
|---|---|---|
| `JWT_SECRET` | Signs all authentication tokens (access + refresh) | 32 chars |
| `ENCRYPTION_KEY` | AES-256 key for encrypting stored DB credentials | 32 chars |
| `PG_PASSWORD` | Password for the application's PostgreSQL database | — |

Generate secure values:

```bash
# JWT_SECRET (128 hex chars)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY (32 hex chars)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

## First-Run Setup

1. Run `node db/init.js` to create the schema.
2. Run `node db/seed.js` — this generates a random admin password, printed once to stdout.
3. Log in with the displayed password. You will be **forced to change it** before full access is granted.

There is no default `admin/admin123` credential. Every deployment gets a unique initial password.

## Key Rotation

### JWT_SECRET Rotation

1. Set the new `JWT_SECRET` in your environment.
2. Restart the server.
3. All existing tokens become invalid — users will need to re-authenticate.
4. This is acceptable since tokens have short TTL (default 7 days).

### ENCRYPTION_KEY Rotation

Stored connection passwords are encrypted with the current key. To rotate:

1. Export all connections (they will be re-encrypted on save).
2. Set the new `ENCRYPTION_KEY`.
3. Restart the server.
4. Existing encrypted passwords will fail to decrypt. For each connection, re-enter the password and save — it will be encrypted with the new key.

A future version will add automated re-encryption migration.

## Audit Log

The audit log is **immutable** by design:

- The runtime DB role only has `INSERT` and `SELECT` privileges on `audit_log`.
- PostgreSQL rules (`CREATE RULE ... DO INSTEAD NOTHING`) silently block any `UPDATE` or `DELETE` attempt.
- No API endpoint exposes update or delete operations on audit data.
- Admin role can **read** and **export** audit logs but never modify them.
- Attempting `DELETE FROM audit_log` at the database level will succeed syntactically but delete zero rows due to the no-op rule.

### What Is Logged

- Login attempts (success/failure)
- User registration and password changes
- Connection CRUD (create/update/delete)
- Every query execution (including federated)
- Query cancellations
- Masked-field access
- Role/permission changes
- Backup and restore operations
- System setup events

## Rate Limiting

Rate limits are **per-user** (keyed on user ID for authenticated requests, IP for unauthenticated):

| Endpoint Type | Default Limit (viewer) | Editor (2x) | Admin (3x) |
|---|---|---|---|
| Auth (login/register) | 10 / 15 min | 20 / 15 min | 30 / 15 min |
| Query execution | 200 / 15 min | 400 / 15 min | 600 / 15 min |
| General API | 500 / 15 min | 1000 / 15 min | 1500 / 15 min |

One user hitting their limit does **not** affect other users.

## Password Policy

All passwords (registration, admin-created users, password changes) must meet:

- Minimum 12 characters (configurable via `PASSWORD_MIN_LENGTH`)
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## Reporting a Vulnerability

If you discover a security issue in yDB:

1. **Do NOT** open a public GitHub issue.
2. Email security concerns to the maintainers (see repository contact info).
3. Include: description of the vulnerability, reproduction steps, potential impact.
4. We will acknowledge within 48 hours and provide a remediation timeline.

## Production Checklist

Before deploying yDB to production:

- [ ] Set `JWT_SECRET` (minimum 32 characters, cryptographically random)
- [ ] Set `ENCRYPTION_KEY` (exactly 32 characters)
- [ ] Set `PG_PASSWORD` (strong, unique database password)
- [ ] Run `db:init` then `db:seed` — save the one-time admin password
- [ ] Change admin password on first login
- [ ] Set `NODE_ENV=production`
- [ ] Configure backup target (`BACKUP_TARGET=s3` for production)
- [ ] Place behind a TLS-terminating reverse proxy (Caddy, Nginx + Let's Encrypt, or ALB)
- [ ] Review and adjust rate limits for your scale (`RATE_LIMIT_*` env vars)
- [ ] Disable open registration or add invite-only flow if needed
- [ ] Verify audit log immutability (`DELETE FROM audit_log` should affect 0 rows)
- [ ] Set up log rotation and monitoring for the backup directory
- [ ] Configure Prometheus scraping from the `/metrics` endpoint
