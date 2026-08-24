-- ═══════════════════════════════════════════════════════════
-- yDB Dummy Database — MySQL
-- E-Commerce Platform Schema
-- Run: mysql -u root -p < mysql-schema.sql
-- ═══════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS ydb_ecommerce;
USE ydb_ecommerce;

-- Users
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    role ENUM('customer', 'merchant', 'admin') DEFAULT 'customer',
    status ENUM('active', 'inactive', 'suspended', 'pending') DEFAULT 'active',
    email_verified BOOLEAN DEFAULT FALSE,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Merchants
CREATE TABLE merchants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    business_name VARCHAR(200) NOT NULL,
    business_type ENUM('individual', 'company', 'enterprise') DEFAULT 'individual',
    registration_number VARCHAR(50),
    tax_id VARCHAR(50),
    country VARCHAR(3) DEFAULT 'MY',
    city VARCHAR(100),
    address TEXT,
    commission_rate DECIMAL(5,2) DEFAULT 2.50,
    status ENUM('active', 'pending', 'suspended', 'rejected') DEFAULT 'pending',
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Products
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    name VARCHAR(300) NOT NULL,
    slug VARCHAR(300),
    description TEXT,
    category VARCHAR(100),
    price DECIMAL(12,2) NOT NULL,
    compare_price DECIMAL(12,2),
    cost_price DECIMAL(12,2),
    stock_quantity INT DEFAULT 0,
    sku VARCHAR(50),
    weight_kg DECIMAL(8,3),
    status ENUM('active', 'draft', 'archived', 'out_of_stock') DEFAULT 'draft',
    featured BOOLEAN DEFAULT FALSE,
    views_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);

-- Orders
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    merchant_id INT NOT NULL,
    order_number VARCHAR(30) UNIQUE NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    shipping_fee DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MYR',
    status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_status ENUM('unpaid', 'paid', 'refunded', 'partial') DEFAULT 'unpaid',
    shipping_address TEXT,
    tracking_number VARCHAR(100),
    notes TEXT,
    ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    shipped_at DATETIME,
    delivered_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

-- Order Items
CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Transactions / Payments
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT,
    user_id INT NOT NULL,
    merchant_id INT,
    type ENUM('payment', 'refund', 'payout', 'topup', 'withdrawal', 'commission') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    fee DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MYR',
    status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    reference VARCHAR(100),
    gateway VARCHAR(50),
    gateway_ref VARCHAR(200),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

-- Wallets
CREATE TABLE wallets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    balance DECIMAL(12,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'MYR',
    status ENUM('active', 'frozen', 'closed') DEFAULT 'active',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Reviews
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    order_id INT,
    rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(200),
    comment TEXT,
    status ENUM('published', 'pending', 'rejected') DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Coupons
CREATE TABLE coupons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) UNIQUE NOT NULL,
    description VARCHAR(200),
    discount_type ENUM('percentage', 'fixed') DEFAULT 'percentage',
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_amount DECIMAL(12,2) DEFAULT 0,
    max_uses INT DEFAULT NULL,
    used_count INT DEFAULT 0,
    status ENUM('active', 'expired', 'disabled') DEFAULT 'active',
    starts_at DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity Logs
CREATE TABLE activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id INT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ═══════════════════════════════════════════════════════════
-- SAMPLE DATA
-- ═══════════════════════════════════════════════════════════

INSERT INTO users (username, email, password_hash, first_name, last_name, phone, role, status, email_verified) VALUES
('admin', 'admin@ydb.io', '$2b$12$dummy', 'Admin', 'System', '+60123456789', 'admin', 'active', TRUE),
('john_doe', 'john@example.com', '$2b$12$dummy', 'John', 'Doe', '+60111111111', 'customer', 'active', TRUE),
('jane_smith', 'jane@example.com', '$2b$12$dummy', 'Jane', 'Smith', '+60122222222', 'customer', 'active', TRUE),
('merchant1', 'shop@techstore.com', '$2b$12$dummy', 'Ahmad', 'Ibrahim', '+60133333333', 'merchant', 'active', TRUE),
('merchant2', 'hello@fashionhub.com', '$2b$12$dummy', 'Siti', 'Aminah', '+60144444444', 'merchant', 'active', TRUE),
('new_user', 'newbie@test.com', '$2b$12$dummy', 'New', 'User', '+60155555555', 'customer', 'pending', FALSE);

INSERT INTO merchants (user_id, business_name, business_type, country, city, commission_rate, status, verified_at) VALUES
(4, 'TechStore MY', 'company', 'MY', 'Kuala Lumpur', 3.00, 'active', NOW()),
(5, 'FashionHub', 'individual', 'MY', 'Penang', 2.50, 'active', NOW());

INSERT INTO products (merchant_id, name, category, price, compare_price, cost_price, stock_quantity, sku, status, featured) VALUES
(1, 'Wireless Bluetooth Headphones', 'Electronics', 149.90, 199.90, 85.00, 150, 'WBH-001', 'active', TRUE),
(1, 'USB-C Hub 7-in-1', 'Electronics', 89.90, 129.90, 45.00, 300, 'UCH-002', 'active', FALSE),
(1, 'Mechanical Keyboard RGB', 'Electronics', 259.00, NULL, 120.00, 80, 'MKR-003', 'active', TRUE),
(2, 'Cotton T-Shirt Premium', 'Fashion', 49.90, 69.90, 18.00, 500, 'CTS-001', 'active', FALSE),
(2, 'Slim Fit Jeans', 'Fashion', 129.00, 159.00, 55.00, 200, 'SFJ-002', 'active', TRUE),
(1, 'Power Bank 20000mAh', 'Electronics', 79.90, 99.90, 35.00, 0, 'PB-004', 'out_of_stock', FALSE);

INSERT INTO orders (user_id, merchant_id, order_number, subtotal, tax_amount, shipping_fee, total_amount, status, payment_method, payment_status) VALUES
(2, 1, 'ORD-2026-0001', 239.80, 14.39, 10.00, 264.19, 'delivered', 'fpx', 'paid'),
(2, 2, 'ORD-2026-0002', 178.90, 10.73, 8.00, 197.63, 'shipped', 'card', 'paid'),
(3, 1, 'ORD-2026-0003', 89.90, 5.39, 0.00, 95.29, 'processing', 'ewallet', 'paid'),
(3, 2, 'ORD-2026-0004', 49.90, 2.99, 5.00, 57.89, 'pending', 'cod', 'unpaid'),
(2, 1, 'ORD-2026-0005', 259.00, 15.54, 0.00, 274.54, 'cancelled', 'fpx', 'refunded');

INSERT INTO transactions (order_id, user_id, merchant_id, type, amount, fee, net_amount, status, gateway, description) VALUES
(1, 2, 1, 'payment', 264.19, 7.93, 256.26, 'completed', 'fpx', 'Payment for ORD-2026-0001'),
(2, 2, 2, 'payment', 197.63, 4.94, 192.69, 'completed', 'stripe', 'Payment for ORD-2026-0002'),
(3, 3, 1, 'payment', 95.29, 2.86, 92.43, 'completed', 'tng', 'Payment for ORD-2026-0003'),
(5, 2, 1, 'refund', 274.54, 0.00, 274.54, 'completed', 'fpx', 'Refund for ORD-2026-0005'),
(NULL, 4, NULL, 'payout', 500.00, 5.00, 495.00, 'completed', 'bank', 'Monthly payout - TechStore');

INSERT INTO wallets (user_id, balance) VALUES (2, 150.00), (3, 75.50), (4, 1250.00), (5, 830.00);

INSERT INTO reviews (product_id, user_id, order_id, rating, title, comment, status) VALUES
(1, 2, 1, 5, 'Excellent sound quality!', 'Best headphones I ever bought. Crystal clear audio.', 'published'),
(2, 3, 3, 4, 'Good value', 'Works well with my MacBook. Slightly warm after long use.', 'published'),
(4, 2, 2, 3, 'Decent shirt', 'Quality is ok but sizing runs small.', 'published');

INSERT INTO coupons (code, description, discount_type, discount_value, min_order_amount, max_uses, status, expires_at) VALUES
('WELCOME20', 'Welcome discount 20%', 'percentage', 20.00, 50.00, 1000, 'active', '2027-12-31'),
('FLAT10', 'RM10 off any order', 'fixed', 10.00, 30.00, NULL, 'active', '2027-06-30'),
('VIP50', 'VIP 50% discount', 'percentage', 50.00, 100.00, 50, 'active', '2026-12-31');
