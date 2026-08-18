/**
 * YDB - Mock Data
 */
YDB.MockData = {
    sampleConnections: [
        { id: 'conn-1', name: 'Local MySQL', type: 'mysql', host: 'localhost', port: 3306, username: 'root', password: '****', database: 'ecommerce_db' },
        { id: 'conn-2', name: 'Production PostgreSQL', type: 'postgresql', host: '192.168.1.100', port: 5432, username: 'admin', password: '****', database: 'app_production' },
        { id: 'conn-3', name: 'Analytics MongoDB', type: 'mongodb', host: 'mongo.internal.io', port: 27017, username: 'analyst', password: '****', database: 'analytics' }
    ],

    schemas: {
        'conn-1': {
            name: 'ecommerce_db',
            tables: {
                users: {
                    columns: [
                        { name: 'id', type: 'INT', key: 'PK', nullable: false },
                        { name: 'username', type: 'VARCHAR(50)', key: '', nullable: false },
                        { name: 'email', type: 'VARCHAR(100)', key: 'UQ', nullable: false },
                        { name: 'password_hash', type: 'VARCHAR(255)', key: '', nullable: false },
                        { name: 'full_name', type: 'VARCHAR(100)', key: '', nullable: true },
                        { name: 'role', type: 'ENUM', key: '', nullable: false },
                        { name: 'created_at', type: 'DATETIME', key: '', nullable: false },
                        { name: 'updated_at', type: 'DATETIME', key: '', nullable: true }
                    ],
                    data: [
                        { id: 1, username: 'admin', email: 'admin@shop.com', password_hash: '$2b$10...', full_name: 'Admin User', role: 'admin', created_at: '2024-01-15 08:00:00', updated_at: '2024-06-01 12:00:00' },
                        { id: 2, username: 'john_doe', email: 'john@gmail.com', password_hash: '$2b$10...', full_name: 'John Doe', role: 'customer', created_at: '2024-02-20 10:30:00', updated_at: null },
                        { id: 3, username: 'jane_smith', email: 'jane@outlook.com', password_hash: '$2b$10...', full_name: 'Jane Smith', role: 'customer', created_at: '2024-03-05 14:15:00', updated_at: '2024-05-10 09:00:00' },
                        { id: 4, username: 'bob_wilson', email: 'bob@yahoo.com', password_hash: '$2b$10...', full_name: 'Bob Wilson', role: 'vendor', created_at: '2024-03-12 11:45:00', updated_at: null },
                        { id: 5, username: 'sarah_m', email: 'sarah@company.io', password_hash: '$2b$10...', full_name: 'Sarah Miller', role: 'customer', created_at: '2024-04-01 16:20:00', updated_at: '2024-07-15 08:30:00' },
                        { id: 6, username: 'mike_t', email: 'mike@dev.io', password_hash: '$2b$10...', full_name: 'Mike Thompson', role: 'customer', created_at: '2024-04-10 09:00:00', updated_at: null },
                        { id: 7, username: 'lisa_chen', email: 'lisa@gmail.com', password_hash: '$2b$10...', full_name: 'Lisa Chen', role: 'vendor', created_at: '2024-04-15 13:30:00', updated_at: '2024-06-20 11:00:00' },
                        { id: 8, username: 'david_k', email: 'david@outlook.com', password_hash: '$2b$10...', full_name: 'David Kim', role: 'customer', created_at: '2024-05-01 08:45:00', updated_at: null },
                        { id: 9, username: 'emma_w', email: 'emma@company.io', password_hash: '$2b$10...', full_name: 'Emma Watson', role: 'admin', created_at: '2024-05-10 14:00:00', updated_at: '2024-07-01 09:30:00' },
                        { id: 10, username: 'alex_r', email: 'alex@startup.co', password_hash: '$2b$10...', full_name: 'Alex Rodriguez', role: 'customer', created_at: '2024-05-20 11:15:00', updated_at: null },
                        { id: 11, username: 'nina_p', email: 'nina@tech.dev', password_hash: '$2b$10...', full_name: 'Nina Patel', role: 'vendor', created_at: '2024-06-01 10:00:00', updated_at: '2024-07-10 16:00:00' },
                        { id: 12, username: 'omar_h', email: 'omar@mail.com', password_hash: '$2b$10...', full_name: 'Omar Hassan', role: 'customer', created_at: '2024-06-05 15:30:00', updated_at: null },
                        { id: 13, username: 'yuki_t', email: 'yuki@japan.co', password_hash: '$2b$10...', full_name: 'Yuki Tanaka', role: 'customer', created_at: '2024-06-10 07:00:00', updated_at: '2024-07-20 12:00:00' },
                        { id: 14, username: 'carlos_m', email: 'carlos@web.mx', password_hash: '$2b$10...', full_name: 'Carlos Martinez', role: 'vendor', created_at: '2024-06-15 12:45:00', updated_at: null },
                        { id: 15, username: 'anna_s', email: 'anna@cloud.eu', password_hash: '$2b$10...', full_name: 'Anna Schmidt', role: 'customer', created_at: '2024-06-20 09:30:00', updated_at: '2024-08-01 08:00:00' }
                    ]
                },
                products: {
                    columns: [
                        { name: 'id', type: 'INT', key: 'PK', nullable: false },
                        { name: 'name', type: 'VARCHAR(200)', key: '', nullable: false },
                        { name: 'category_id', type: 'INT', key: 'FK', nullable: false },
                        { name: 'price', type: 'DECIMAL(10,2)', key: '', nullable: false },
                        { name: 'stock', type: 'INT', key: '', nullable: false },
                        { name: 'description', type: 'TEXT', key: '', nullable: true },
                        { name: 'created_at', type: 'DATETIME', key: '', nullable: false }
                    ],
                    data: [
                        { id: 1, name: 'Wireless Mouse', category_id: 1, price: 29.99, stock: 150, description: 'Ergonomic wireless mouse', created_at: '2024-01-20 09:00:00' },
                        { id: 2, name: 'Mechanical Keyboard', category_id: 1, price: 89.99, stock: 75, description: 'RGB mechanical keyboard', created_at: '2024-01-22 10:00:00' },
                        { id: 3, name: 'USB-C Hub', category_id: 1, price: 49.99, stock: 200, description: '7-in-1 USB-C hub', created_at: '2024-02-01 11:00:00' },
                        { id: 4, name: 'Monitor Stand', category_id: 2, price: 39.99, stock: 80, description: 'Adjustable monitor stand', created_at: '2024-02-15 08:30:00' },
                        { id: 5, name: 'Webcam HD', category_id: 1, price: 59.99, stock: 120, description: '1080p HD webcam', created_at: '2024-03-01 14:00:00' },
                        { id: 6, name: 'Desk Lamp', category_id: 2, price: 24.99, stock: 300, description: 'LED desk lamp', created_at: '2024-03-10 09:15:00' }
                    ]
                },
                orders: {
                    columns: [
                        { name: 'id', type: 'INT', key: 'PK', nullable: false },
                        { name: 'user_id', type: 'INT', key: 'FK', nullable: false },
                        { name: 'total_amount', type: 'DECIMAL(10,2)', key: '', nullable: false },
                        { name: 'status', type: 'ENUM', key: '', nullable: false },
                        { name: 'shipping_address', type: 'TEXT', key: '', nullable: false },
                        { name: 'created_at', type: 'DATETIME', key: '', nullable: false }
                    ],
                    data: [
                        { id: 1001, user_id: 2, total_amount: 119.98, status: 'delivered', shipping_address: '123 Main St, NY', created_at: '2024-03-15 10:00:00' },
                        { id: 1002, user_id: 3, total_amount: 49.99, status: 'shipped', shipping_address: '456 Oak Ave, CA', created_at: '2024-04-02 14:30:00' },
                        { id: 1003, user_id: 2, total_amount: 89.99, status: 'processing', shipping_address: '123 Main St, NY', created_at: '2024-05-10 09:15:00' },
                        { id: 1004, user_id: 5, total_amount: 154.97, status: 'delivered', shipping_address: '789 Pine Rd, TX', created_at: '2024-05-20 16:45:00' },
                        { id: 1005, user_id: 3, total_amount: 29.99, status: 'pending', shipping_address: '456 Oak Ave, CA', created_at: '2024-06-01 08:00:00' }
                    ]
                },
                categories: {
                    columns: [
                        { name: 'id', type: 'INT', key: 'PK', nullable: false },
                        { name: 'name', type: 'VARCHAR(100)', key: '', nullable: false },
                        { name: 'description', type: 'TEXT', key: '', nullable: true }
                    ],
                    data: [
                        { id: 1, name: 'Electronics', description: 'Electronic devices' },
                        { id: 2, name: 'Office', description: 'Office supplies' },
                        { id: 3, name: 'Software', description: 'Software licenses' }
                    ]
                }
            },
            views: ['active_users', 'order_summary']
        },
        'conn-2': {
            name: 'app_production',
            tables: {
                employees: {
                    columns: [
                        { name: 'id', type: 'SERIAL', key: 'PK', nullable: false },
                        { name: 'first_name', type: 'VARCHAR(50)', key: '', nullable: false },
                        { name: 'last_name', type: 'VARCHAR(50)', key: '', nullable: false },
                        { name: 'email', type: 'VARCHAR(100)', key: 'UQ', nullable: false },
                        { name: 'department_id', type: 'INT', key: 'FK', nullable: true },
                        { name: 'salary', type: 'NUMERIC(10,2)', key: '', nullable: false },
                        { name: 'hire_date', type: 'DATE', key: '', nullable: false }
                    ],
                    data: [
                        { id: 1, first_name: 'Ahmad', last_name: 'Rahman', email: 'ahmad@company.com', department_id: 1, salary: 75000, hire_date: '2022-03-15' },
                        { id: 2, first_name: 'Siti', last_name: 'Nurhaliza', email: 'siti@company.com', department_id: 2, salary: 82000, hire_date: '2021-08-01' },
                        { id: 3, first_name: 'Wei', last_name: 'Chen', email: 'wei@company.com', department_id: 1, salary: 90000, hire_date: '2020-11-20' },
                        { id: 4, first_name: 'Priya', last_name: 'Sharma', email: 'priya@company.com', department_id: 3, salary: 68000, hire_date: '2023-01-10' },
                        { id: 5, first_name: 'Ali', last_name: 'Hassan', email: 'ali@company.com', department_id: 2, salary: 95000, hire_date: '2019-06-15' }
                    ]
                },
                departments: {
                    columns: [
                        { name: 'id', type: 'SERIAL', key: 'PK', nullable: false },
                        { name: 'name', type: 'VARCHAR(100)', key: '', nullable: false },
                        { name: 'location', type: 'VARCHAR(200)', key: '', nullable: true },
                        { name: 'budget', type: 'NUMERIC(12,2)', key: '', nullable: true }
                    ],
                    data: [
                        { id: 1, name: 'Engineering', location: 'Floor 3', budget: 500000 },
                        { id: 2, name: 'Marketing', location: 'Floor 2', budget: 300000 },
                        { id: 3, name: 'Human Resources', location: 'Floor 1', budget: 200000 }
                    ]
                }
            },
            views: ['employee_details']
        },
        'conn-3': {
            name: 'analytics',
            tables: {
                events: {
                    columns: [
                        { name: '_id', type: 'ObjectId', key: 'PK', nullable: false },
                        { name: 'event_type', type: 'String', key: '', nullable: false },
                        { name: 'user_id', type: 'String', key: '', nullable: false },
                        { name: 'timestamp', type: 'Date', key: '', nullable: false },
                        { name: 'metadata', type: 'Object', key: '', nullable: true }
                    ],
                    data: [
                        { _id: '65a1b2c3d4e5f6', event_type: 'page_view', user_id: 'usr_001', timestamp: '2024-06-01T10:30:00Z', metadata: '{ page: "/home" }' },
                        { _id: '65a1b2c3d4e5f7', event_type: 'click', user_id: 'usr_002', timestamp: '2024-06-01T11:15:00Z', metadata: '{ button: "signup" }' },
                        { _id: '65a1b2c3d4e5f8', event_type: 'purchase', user_id: 'usr_001', timestamp: '2024-06-02T09:00:00Z', metadata: '{ amount: 49.99 }' }
                    ]
                },
                sessions: {
                    columns: [
                        { name: '_id', type: 'ObjectId', key: 'PK', nullable: false },
                        { name: 'user_id', type: 'String', key: '', nullable: false },
                        { name: 'start_time', type: 'Date', key: '', nullable: false },
                        { name: 'duration_ms', type: 'Number', key: '', nullable: false },
                        { name: 'pages_viewed', type: 'Number', key: '', nullable: false }
                    ],
                    data: [
                        { _id: '75b2c3d4e5f6a1', user_id: 'usr_001', start_time: '2024-06-01T10:25:00Z', duration_ms: 345000, pages_viewed: 8 },
                        { _id: '75b2c3d4e5f6a2', user_id: 'usr_002', start_time: '2024-06-01T11:10:00Z', duration_ms: 120000, pages_viewed: 3 }
                    ]
                }
            },
            views: ['daily_active_users']
        }
    },

    relationships: {
        'conn-1': [
            { from: 'orders', fromCol: 'user_id', to: 'users', toCol: 'id' },
            { from: 'products', fromCol: 'category_id', to: 'categories', toCol: 'id' }
        ],
        'conn-2': [
            { from: 'employees', fromCol: 'department_id', to: 'departments', toCol: 'id' }
        ],
        'conn-3': []
    }
};
