/**
 * ═══════════════════════════════════════════════════════════
 * yDB Dummy Database — MongoDB
 * Social Media / Content Platform Schema
 * Run: mongosh < mongodb-schema.js
 * Or: node mongodb-schema.js (with MONGO_URI env var)
 * ═══════════════════════════════════════════════════════════
 */

// Switch to database
db = db.getSiblingDB('ydb_social');

// Drop existing collections for clean setup
db.users.drop();
db.posts.drop();
db.comments.drop();
db.messages.drop();
db.notifications.drop();
db.analytics.drop();

// ═══════════════════════════════════════════════════════════
// COLLECTIONS + SCHEMA VALIDATION
// ═══════════════════════════════════════════════════════════

// Users collection
db.createCollection('users', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['username', 'email', 'displayName'],
            properties: {
                username: { bsonType: 'string', minLength: 3, maxLength: 30 },
                email: { bsonType: 'string' },
                displayName: { bsonType: 'string' },
                bio: { bsonType: 'string' },
                avatarUrl: { bsonType: 'string' },
                role: { enum: ['user', 'creator', 'moderator', 'admin'] },
                status: { enum: ['active', 'suspended', 'deactivated'] },
                followers: { bsonType: 'int' },
                following: { bsonType: 'int' },
                postsCount: { bsonType: 'int' },
                verified: { bsonType: 'bool' },
                settings: { bsonType: 'object' },
                createdAt: { bsonType: 'date' }
            }
        }
    }
});

// Posts collection
db.createCollection('posts', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['authorId', 'content', 'type'],
            properties: {
                authorId: { bsonType: 'objectId' },
                content: { bsonType: 'string' },
                type: { enum: ['text', 'image', 'video', 'link', 'poll'] },
                media: { bsonType: 'array' },
                tags: { bsonType: 'array' },
                likes: { bsonType: 'int' },
                comments: { bsonType: 'int' },
                shares: { bsonType: 'int' },
                views: { bsonType: 'int' },
                status: { enum: ['published', 'draft', 'archived', 'flagged'] },
                visibility: { enum: ['public', 'followers', 'private'] },
                location: { bsonType: 'object' },
                createdAt: { bsonType: 'date' }
            }
        }
    }
});

// Indexes
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ status: 1, role: 1 });
db.posts.createIndex({ authorId: 1, createdAt: -1 });
db.posts.createIndex({ tags: 1 });
db.posts.createIndex({ status: 1, visibility: 1 });
db.comments.createIndex({ postId: 1, createdAt: -1 });
db.messages.createIndex({ conversationId: 1, createdAt: -1 });
db.notifications.createIndex({ userId: 1, read: 1, createdAt: -1 });
db.analytics.createIndex({ type: 1, date: 1 });

// ═══════════════════════════════════════════════════════════
// SAMPLE DATA
// ═══════════════════════════════════════════════════════════

// Users
db.users.insertMany([
    {
        username: 'techguru',
        email: 'guru@tech.com',
        displayName: 'Tech Guru',
        bio: 'Full-stack developer. Open source enthusiast.',
        role: 'creator',
        status: 'active',
        followers: 15200,
        following: 340,
        postsCount: 89,
        verified: true,
        settings: { theme: 'dark', notifications: true, language: 'en' },
        createdAt: new Date('2024-01-15')
    },
    {
        username: 'designqueen',
        email: 'queen@design.io',
        displayName: 'Design Queen',
        bio: 'UI/UX Designer | Figma lover',
        role: 'creator',
        status: 'active',
        followers: 8900,
        following: 220,
        postsCount: 45,
        verified: true,
        settings: { theme: 'light', notifications: true, language: 'en' },
        createdAt: new Date('2024-03-20')
    },
    {
        username: 'newdev',
        email: 'newdev@gmail.com',
        displayName: 'New Developer',
        bio: 'Learning to code!',
        role: 'user',
        status: 'active',
        followers: 23,
        following: 150,
        postsCount: 5,
        verified: false,
        settings: { theme: 'dark', notifications: true, language: 'ms' },
        createdAt: new Date('2026-06-01')
    },
    {
        username: 'moderator1',
        email: 'mod@platform.com',
        displayName: 'Community Mod',
        bio: 'Keeping things civil.',
        role: 'moderator',
        status: 'active',
        followers: 500,
        following: 1200,
        postsCount: 12,
        verified: false,
        settings: { theme: 'dark', notifications: true, language: 'en' },
        createdAt: new Date('2025-01-01')
    },
    {
        username: 'suspended_user',
        email: 'bad@actor.com',
        displayName: 'Bad Actor',
        bio: '',
        role: 'user',
        status: 'suspended',
        followers: 0,
        following: 0,
        postsCount: 0,
        verified: false,
        settings: {},
        createdAt: new Date('2026-07-01')
    }
]);

// Get user IDs for reference
var users = db.users.find().toArray();
var guruId = users[0]._id;
var queenId = users[1]._id;
var newdevId = users[2]._id;

// Posts
db.posts.insertMany([
    {
        authorId: guruId,
        content: 'Just launched yDB v2.0 — now with AI-powered BI Copilot! Ask questions in plain English and get SQL results instantly.',
        type: 'text',
        tags: ['ydb', 'database', 'ai', 'launch'],
        likes: 342,
        comments: 28,
        shares: 56,
        views: 4500,
        status: 'published',
        visibility: 'public',
        createdAt: new Date('2026-08-20')
    },
    {
        authorId: queenId,
        content: 'New brand identity for yDB! Gradient blue-purple bird logo. What do you think?',
        type: 'image',
        media: [{ url: '/uploads/ydb-logo.png', type: 'image/png', size: 245000 }],
        tags: ['design', 'branding', 'logo'],
        likes: 189,
        comments: 15,
        shares: 22,
        views: 2100,
        status: 'published',
        visibility: 'public',
        createdAt: new Date('2026-08-19')
    },
    {
        authorId: newdevId,
        content: 'Day 1 of learning SQL. This yDB tool makes it so much easier with the chat interface!',
        type: 'text',
        tags: ['learning', 'sql', 'beginner'],
        likes: 12,
        comments: 3,
        shares: 1,
        views: 150,
        status: 'published',
        visibility: 'public',
        createdAt: new Date('2026-08-21')
    },
    {
        authorId: guruId,
        content: 'Pro tip: Use "monthly trend of transactions" in yDB BI Copilot to get instant revenue charts.',
        type: 'text',
        tags: ['ydb', 'tips', 'bi'],
        likes: 95,
        comments: 7,
        shares: 18,
        views: 1200,
        status: 'published',
        visibility: 'public',
        createdAt: new Date('2026-08-18')
    },
    {
        authorId: queenId,
        content: 'Draft: Upcoming tutorial on dashboard design patterns...',
        type: 'text',
        tags: ['design', 'tutorial'],
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
        status: 'draft',
        visibility: 'private',
        createdAt: new Date('2026-08-21')
    }
]);

// Comments
var posts = db.posts.find({ status: 'published' }).toArray();
db.comments.insertMany([
    { postId: posts[0]._id, authorId: queenId, content: 'This is amazing! The AI chat feature is so intuitive.', likes: 15, createdAt: new Date('2026-08-20T10:00:00Z') },
    { postId: posts[0]._id, authorId: newdevId, content: 'Can it work with MongoDB too?', likes: 3, createdAt: new Date('2026-08-20T11:00:00Z') },
    { postId: posts[1]._id, authorId: guruId, content: 'Love the gradient! Very clean.', likes: 8, createdAt: new Date('2026-08-19T15:00:00Z') },
    { postId: posts[2]._id, authorId: guruId, content: 'Great start! Try asking "how many users" next.', likes: 5, createdAt: new Date('2026-08-21T09:00:00Z') }
]);

// Messages
db.messages.insertMany([
    { conversationId: 'conv_1', senderId: guruId, receiverId: queenId, content: 'Hey, love the new logo!', read: true, createdAt: new Date('2026-08-19T14:00:00Z') },
    { conversationId: 'conv_1', senderId: queenId, receiverId: guruId, content: 'Thanks! Took me 3 iterations.', read: true, createdAt: new Date('2026-08-19T14:05:00Z') },
    { conversationId: 'conv_2', senderId: newdevId, receiverId: guruId, content: 'Hi, can you help me with SQL joins?', read: false, createdAt: new Date('2026-08-21T08:00:00Z') }
]);

// Notifications
db.notifications.insertMany([
    { userId: guruId, type: 'like', message: 'Design Queen liked your post', read: false, createdAt: new Date('2026-08-20T10:00:00Z') },
    { userId: guruId, type: 'comment', message: 'New Developer commented on your post', read: false, createdAt: new Date('2026-08-20T11:00:00Z') },
    { userId: queenId, type: 'follower', message: 'New Developer followed you', read: true, createdAt: new Date('2026-08-19T12:00:00Z') },
    { userId: newdevId, type: 'mention', message: 'Tech Guru mentioned you in a comment', read: false, createdAt: new Date('2026-08-21T09:00:00Z') }
]);

// Analytics (daily aggregates)
db.analytics.insertMany([
    { type: 'daily_active_users', date: new Date('2026-08-20'), value: 1250, platform: 'web' },
    { type: 'daily_active_users', date: new Date('2026-08-20'), value: 890, platform: 'mobile' },
    { type: 'daily_active_users', date: new Date('2026-08-19'), value: 1180, platform: 'web' },
    { type: 'daily_posts', date: new Date('2026-08-20'), value: 342 },
    { type: 'daily_posts', date: new Date('2026-08-19'), value: 298 },
    { type: 'daily_signups', date: new Date('2026-08-20'), value: 45 },
    { type: 'daily_signups', date: new Date('2026-08-19'), value: 38 },
    { type: 'revenue', date: new Date('2026-08-20'), value: 1250.00, currency: 'USD' },
    { type: 'revenue', date: new Date('2026-08-19'), value: 980.00, currency: 'USD' }
]);

print('');
print('=== yDB MongoDB Dummy Data Created ===');
print('Database: ydb_social');
print('Collections: users, posts, comments, messages, notifications, analytics');
print('Users: ' + db.users.countDocuments());
print('Posts: ' + db.posts.countDocuments());
print('Comments: ' + db.comments.countDocuments());
print('');
