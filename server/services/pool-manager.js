/**
 * @file services/pool-manager.js
 * @description Connection pool manager — caches adapter instances per connection ID
 * with idle timeout and max connections.
 */

const { createAdapter } = require('./adapters');

class PoolManager {
    constructor() {
        /** @type {Map<string, { adapter, lastUsed, timer }>} */
        this.pools = new Map();
        this.idleTimeoutMs = 5 * 60 * 1000; // 5 minutes
        this.maxPools = 50;
    }

    /**
     * Get or create an adapter for a connection.
     * @param {string} connId - Unique connection identifier
     * @param {string} dbType - Database type
     * @param {Object} opts - Connection options
     * @returns {Promise<BaseAdapter>}
     */
    async getAdapter(connId, dbType, opts) {
        const key = String(connId);

        if (this.pools.has(key)) {
            const entry = this.pools.get(key);
            entry.lastUsed = Date.now();
            clearTimeout(entry.timer);
            entry.timer = this._setIdleTimer(key);
            return entry.adapter;
        }

        // Evict oldest if at capacity
        if (this.pools.size >= this.maxPools) {
            this._evictOldest();
        }

        const adapter = createAdapter(dbType, opts);
        await adapter.connect();

        // Don't cache REST API adapters (they don't benefit from pooling)
        if (dbType === 'restapi' || dbType === 'api') {
            return adapter;
        }

        this.pools.set(key, {
            adapter,
            lastUsed: Date.now(),
            timer: this._setIdleTimer(key)
        });

        return adapter;
    }

    /**
     * Release a specific connection pool.
     * @param {string} connId
     */
    async release(connId) {
        const key = String(connId);
        if (!this.pools.has(key)) return;

        const entry = this.pools.get(key);
        clearTimeout(entry.timer);
        try { await entry.adapter.disconnect(); } catch (e) { /* ignore */ }
        this.pools.delete(key);
    }

    /**
     * Release all pools (graceful shutdown).
     */
    async releaseAll() {
        for (const [key, entry] of this.pools) {
            clearTimeout(entry.timer);
            try { await entry.adapter.disconnect(); } catch (e) { /* ignore */ }
        }
        this.pools.clear();
    }

    /** @private Set idle timeout — auto-disconnect after inactivity */
    _setIdleTimer(key) {
        return setTimeout(async () => {
            await this.release(key);
            console.log(`[Pool] Idle timeout: released connection ${key}`);
        }, this.idleTimeoutMs);
    }

    /** @private Evict the least recently used pool */
    _evictOldest() {
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [key, entry] of this.pools) {
            if (entry.lastUsed < oldestTime) {
                oldestTime = entry.lastUsed;
                oldestKey = key;
            }
        }
        if (oldestKey) this.release(oldestKey);
    }

    /** Get pool stats */
    getStats() {
        return {
            activePools: this.pools.size,
            maxPools: this.maxPools,
            connections: Array.from(this.pools.entries()).map(([key, entry]) => ({
                id: key,
                lastUsed: new Date(entry.lastUsed).toISOString(),
                connected: entry.adapter.connected
            }))
        };
    }
}

// Singleton
module.exports = new PoolManager();
