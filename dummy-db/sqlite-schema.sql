-- ═══════════════════════════════════════════════════════════
-- yDB Dummy Database — SQLite
-- Task Management / Project Tracker Schema
-- Run: sqlite3 ydb_tasks.db < sqlite-schema.sql
-- ═══════════════════════════════════════════════════════════

-- Teams
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    owner_id INTEGER,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'guest')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'on_hold')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    start_date TEXT,
    due_date TEXT,
    budget REAL DEFAULT 0,
    spent REAL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    assigned_to INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done', 'blocked')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    estimated_hours REAL,
    actual_hours REAL DEFAULT 0,
    due_date TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Time Entries
CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    hours REAL NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    billable INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#6366f1'
);

-- Task Tags (many-to-many)
CREATE TABLE IF NOT EXISTS task_tags (
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

-- Files / Attachments
CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    uploaded_by INTEGER REFERENCES users(id),
    filename TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    url TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- SAMPLE DATA
-- ═══════════════════════════════════════════════════════════

INSERT INTO teams (name, description, owner_id) VALUES
('Engineering', 'Software development team', 1),
('Design', 'UI/UX design team', 4);

INSERT INTO users (team_id, name, email, role, status) VALUES
(1, 'Ahmad Rizal', 'ahmad@company.com', 'owner', 'active'),
(1, 'Sarah Lee', 'sarah@company.com', 'admin', 'active'),
(1, 'Raj Patel', 'raj@company.com', 'member', 'active'),
(2, 'Lisa Tan', 'lisa@company.com', 'owner', 'active'),
(2, 'Mike Chen', 'mike@company.com', 'member', 'active');

INSERT INTO projects (team_id, name, description, status, priority, budget, spent, created_by, start_date, due_date) VALUES
(1, 'yDB v2.0', 'Major platform upgrade', 'active', 'high', 50000.00, 22000.00, 1, '2026-01-01', '2026-09-30'),
(1, 'API Gateway', 'Build API gateway service', 'active', 'medium', 15000.00, 8500.00, 2, '2026-03-01', '2026-07-31'),
(2, 'Brand Refresh', 'New logo and style guide', 'completed', 'low', 5000.00, 4800.00, 4, '2026-02-01', '2026-04-30');

INSERT INTO tasks (project_id, assigned_to, title, status, priority, estimated_hours, actual_hours, due_date) VALUES
(1, 1, 'Implement NLQ engine', 'done', 'critical', 40, 38, '2026-08-15'),
(1, 2, 'Add query cancellation', 'done', 'high', 16, 14, '2026-08-10'),
(1, 3, 'Write unit tests', 'in_progress', 'medium', 24, 12, '2026-08-25'),
(1, 1, 'Deploy to production', 'todo', 'high', 8, 0, '2026-09-01'),
(2, 2, 'Design API spec', 'done', 'high', 20, 18, '2026-05-01'),
(2, 3, 'Rate limiting middleware', 'review', 'medium', 12, 10, '2026-06-15'),
(2, 3, 'Auth service', 'in_progress', 'high', 30, 20, '2026-07-01'),
(3, 4, 'Logo design', 'done', 'high', 16, 15, '2026-03-15'),
(3, 5, 'Color palette', 'done', 'medium', 8, 6, '2026-03-20'),
(1, 2, 'Fix MySQL SSL bug', 'blocked', 'critical', 4, 2, '2026-08-20');

INSERT INTO tags (name, color) VALUES
('bug', '#ef4444'), ('feature', '#10b981'), ('docs', '#6366f1'),
('urgent', '#f59e0b'), ('backend', '#06b6d4'), ('frontend', '#ec4899');

INSERT INTO task_tags (task_id, tag_id) VALUES
(1, 2), (1, 5), (2, 2), (2, 5), (3, 3), (4, 5),
(5, 3), (6, 2), (6, 5), (7, 2), (7, 5), (10, 1), (10, 4);

INSERT INTO time_entries (task_id, user_id, hours, description, date, billable) VALUES
(1, 1, 8, 'NLQ pattern matching engine', '2026-08-10', 1),
(1, 1, 6, 'Schema detection logic', '2026-08-11', 1),
(2, 2, 4, 'Cancel endpoint', '2026-08-08', 1),
(3, 3, 3, 'Auth middleware tests', '2026-08-20', 1),
(7, 3, 5, 'JWT implementation', '2026-06-20', 1);

INSERT INTO comments (task_id, user_id, content) VALUES
(1, 2, 'Looks great! The table detection is really smart now.'),
(3, 1, 'Make sure to cover edge cases for rate limiting.'),
(10, 3, 'Blocked on cloud provider - they do not support SSL on this plan.');
