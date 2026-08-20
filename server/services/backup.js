/**
 * @file services/backup.js
 * @description Automated backup service — scheduled SQL dumps.
 * Exports schema + data from user connections to file.
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/pool');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

/**
 * Ensure backup directory exists.
 */
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

/**
 * Create a backup of the yDB app database (users, connections, audit, etc.)
 * @returns {string} Backup file path
 */
async function backupAppDatabase() {
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ydb_app_${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    const tables = ['users', 'connections', 'saved_queries', 'audit_log', 'schedules'];
    let dump = `-- yDB App Backup\n-- Date: ${new Date().toISOString()}\n\n`;

    for (const table of tables) {
        try {
            const result = await db.query(`SELECT * FROM ${table}`);
            if (result.rows.length) {
                const cols = Object.keys(result.rows[0]);
                dump += `-- Table: ${table} (${result.rows.length} rows)\n`;
                for (const row of result.rows) {
                    const vals = cols.map(c => {
                        const v = row[c];
                        if (v === null) return 'NULL';
                        if (typeof v === 'number') return v;
                        return `'${String(v).replace(/'/g, "''")}'`;
                    });
                    dump += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
                }
                dump += '\n';
            }
        } catch (e) { /* skip if table doesn't exist */ }
    }

    fs.writeFileSync(filepath, dump);
    console.log(`[Backup] Created: ${filename}`);
    return filepath;
}

/**
 * Start scheduled backup (every 6 hours).
 */
function startScheduledBackup() {
    const intervalMs = 6 * 60 * 60 * 1000; // 6 hours
    setInterval(async () => {
        try {
            await backupAppDatabase();
        } catch (err) {
            console.error('[Backup] Failed:', err.message);
        }
    }, intervalMs);

    console.log('[Backup] Scheduled: every 6 hours');
}

/**
 * List available backups.
 * @returns {Array<{filename, size, created}>}
 */
function listBackups() {
    ensureBackupDir();
    return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.sql'))
        .map(f => {
            const stat = fs.statSync(path.join(BACKUP_DIR, f));
            return { filename: f, size: stat.size, created: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.created.localeCompare(a.created));
}

module.exports = { backupAppDatabase, startScheduledBackup, listBackups, BACKUP_DIR };
