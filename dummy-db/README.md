# Dummy Databases for yDB

Sample schemas and data for testing yDB connections and Copilot features.

## Schemas

| File | Database | Domain | Tables/Collections |
|---|---|---|---|
| `mysql-schema.sql` | MySQL | E-Commerce Platform | users, merchants, products, orders, transactions, wallets, reviews, coupons |
| `postgresql-schema.sql` | PostgreSQL | SaaS Analytics | accounts, users, projects, events, dashboards, reports, subscriptions, invoices |
| `sqlite-schema.sql` | SQLite | Task Management | teams, users, projects, tasks, comments, time_entries, tags, attachments |
| `mongodb-schema.js` | MongoDB | Social Media | users, posts, comments, messages, notifications, analytics |

## How to Use

### MySQL
```bash
mysql -u root -p < mysql-schema.sql
```

### PostgreSQL
```bash
psql -U postgres -f postgresql-schema.sql
```

### SQLite
```bash
sqlite3 ydb_tasks.db < sqlite-schema.sql
```

### MongoDB
```bash
mongosh < mongodb-schema.js
```

## Testing with yDB Copilot

After importing, connect to the database in yDB and try these questions:

**MySQL (E-Commerce):**
- "How many orders this month?"
- "Total revenue by merchant"
- "Top 10 products by price"
- "Breakdown of orders by status"
- "Monthly transaction trend"

**PostgreSQL (Analytics):**
- "How many events today?"
- "Total invoice amount"
- "Breakdown of users by role"
- "Monthly subscription revenue"
- "Top accounts by plan"

**SQLite (Tasks):**
- "How many tasks are blocked?"
- "Total hours logged this week"
- "Breakdown of tasks by status"
- "Top users by actual hours"
- "Latest 10 completed tasks"

**MongoDB (Social):**
- "How many users are active?"
- "Top posts by likes"
- "Daily signup trend"
- "Breakdown by role"
