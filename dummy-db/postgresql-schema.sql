-- ═══════════════════════════════════════════════════════════
-- yDB Dummy Database — PostgreSQL
-- SaaS Analytics Platform Schema
-- Run: psql -U postgres -f postgresql-schema.sql
-- ═══════════════════════════════════════════════════════════

CREATE DATABASE ydb_analytics;
\c ydb_analytics;

-- Accounts (tenants)
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled', 'trial')),
    max_users INT DEFAULT 5,
    max_projects INT DEFAULT 3,
    billing_email VARCHAR(255),
    country VARCHAR(3) DEFAULT 'MY',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    account_id INT REFERENCES accounts(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
    avatar_url TEXT,
    timezone VARCHAR(50) DEFAULT 'Asia/Kuala_Lumpur',
    last_seen_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    account_id INT REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    api_key VARCHAR(64) UNIQUE,
    daily_event_limit INT DEFAULT 10000,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Events (analytics events)
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    user_id INT,
    event_name VARCHAR(100) NOT NULL,
    properties JSONB DEFAULT '{}',
    session_id VARCHAR(64),
    device_type VARCHAR(20),
    browser VARCHAR(50),
    os VARCHAR(50),
    country VARCHAR(3),
    city VARCHAR(100),
    ip_address INET,
    referrer TEXT,
    page_url TEXT,
    duration_ms INT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dashboards
CREATE TABLE dashboards (
    id SERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    layout JSONB DEFAULT '[]',
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Reports (scheduled)
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    query_sql TEXT NOT NULL,
    schedule VARCHAR(20) DEFAULT 'daily' CHECK (schedule IN ('hourly', 'daily', 'weekly', 'monthly')),
    recipients TEXT[],
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- API Usage / Rate Limiting
CREATE TABLE api_usage (
    id BIGSERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    endpoint VARCHAR(200) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INT,
    response_time_ms INT,
    request_size_bytes INT,
    response_size_bytes INT,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions / Billing
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    account_id INT REFERENCES accounts(id) ON DELETE CASCADE,
    plan VARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    interval VARCHAR(10) DEFAULT 'monthly' CHECK (interval IN ('monthly', 'yearly')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    account_id INT REFERENCES accounts(id),
    subscription_id INT REFERENCES subscriptions(id),
    amount DECIMAL(10,2) NOT NULL,
    tax DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'void')),
    due_date DATE,
    paid_at TIMESTAMP,
    invoice_number VARCHAR(30) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_project ON events(project_id, created_at DESC);
CREATE INDEX idx_events_name ON events(event_name);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_api_usage_project ON api_usage(project_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- SAMPLE DATA
-- ═══════════════════════════════════════════════════════════

INSERT INTO accounts (name, slug, plan, status, max_users, max_projects) VALUES
('Acme Corp', 'acme', 'pro', 'active', 20, 10),
('StartupXYZ', 'startupxyz', 'starter', 'active', 5, 3),
('BigEnterprise', 'bigent', 'enterprise', 'active', 100, 50);

INSERT INTO users (account_id, email, name, password_hash, role, status) VALUES
(1, 'ceo@acme.com', 'Alice Wong', '$2b$12$dummy', 'owner', 'active'),
(1, 'dev@acme.com', 'Bob Lee', '$2b$12$dummy', 'admin', 'active'),
(1, 'intern@acme.com', 'Charlie Tan', '$2b$12$dummy', 'member', 'active'),
(2, 'founder@startupxyz.com', 'Dave Kumar', '$2b$12$dummy', 'owner', 'active'),
(3, 'admin@bigent.com', 'Eve Chen', '$2b$12$dummy', 'owner', 'active');

INSERT INTO projects (account_id, name, description, api_key, created_by) VALUES
(1, 'Web App', 'Main SaaS web application', 'pk_acme_web_1234567890', 1),
(1, 'Mobile App', 'iOS and Android app', 'pk_acme_mob_0987654321', 2),
(2, 'MVP', 'Minimum viable product', 'pk_startup_mvp_111222333', 4),
(3, 'Platform', 'Enterprise platform', 'pk_bigent_plat_444555666', 5);

INSERT INTO events (project_id, event_name, properties, device_type, browser, country, duration_ms, created_at) VALUES
(1, 'page_view', '{"page": "/dashboard"}', 'desktop', 'Chrome', 'MY', 1200, NOW() - INTERVAL '1 hour'),
(1, 'page_view', '{"page": "/settings"}', 'desktop', 'Firefox', 'SG', 800, NOW() - INTERVAL '2 hours'),
(1, 'button_click', '{"button": "upgrade"}', 'mobile', 'Safari', 'MY', 100, NOW() - INTERVAL '3 hours'),
(1, 'signup', '{"plan": "pro"}', 'desktop', 'Chrome', 'US', 5000, NOW() - INTERVAL '1 day'),
(2, 'app_open', '{"version": "2.1.0"}', 'mobile', 'WebView', 'MY', 300, NOW()),
(3, 'page_view', '{"page": "/home"}', 'desktop', 'Edge', 'IN', 900, NOW() - INTERVAL '5 hours');

INSERT INTO subscriptions (account_id, plan, amount, interval, status, current_period_start, current_period_end) VALUES
(1, 'pro', 49.00, 'monthly', 'active', NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days'),
(2, 'starter', 19.00, 'monthly', 'active', NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days'),
(3, 'enterprise', 299.00, 'yearly', 'active', NOW() - INTERVAL '3 months', NOW() + INTERVAL '9 months');

INSERT INTO invoices (account_id, subscription_id, amount, tax, total, status, invoice_number, paid_at) VALUES
(1, 1, 49.00, 2.94, 51.94, 'paid', 'INV-2026-001', NOW() - INTERVAL '15 days'),
(2, 2, 19.00, 1.14, 20.14, 'paid', 'INV-2026-002', NOW() - INTERVAL '5 days'),
(3, 3, 299.00, 17.94, 316.94, 'paid', 'INV-2026-003', NOW() - INTERVAL '3 months');
