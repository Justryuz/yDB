/**
 * @file services/nlq-vector-store.js
 * @description Simple in-memory vector store for NLQ Q&A pairs.
 * Stores question-SQL pairs and retrieves the most similar ones
 * using cosine similarity on keyword vectors (no external dependencies).
 *
 * When LLM generates a successful query, it gets stored here as a
 * training example for future similar questions.
 */

const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', '..', 'nlq-training.json');
const MAX_PAIRS = 500;

class NLQVectorStore {
    constructor() {
        this.pairs = [];
        this._load();
    }

    /**
     * Add a successful Q&A pair to the store.
     * @param {Object} entry
     * @param {string} entry.question - Natural language question
     * @param {string} entry.sql - Generated SQL that executed successfully
     * @param {string} entry.connectionId - Connection ID
     * @param {string} entry.dbType - Database type
     * @param {string[]} entry.tables - Tables used in the query
     */
    add(entry) {
        const pair = {
            question: entry.question,
            sql: entry.sql,
            connectionId: String(entry.connectionId),
            dbType: entry.dbType || '',
            tables: entry.tables || [],
            keywords: this._extractKeywords(entry.question),
            ts: Date.now()
        };

        // Avoid duplicates (same question)
        const existing = this.pairs.findIndex(p => p.question.toLowerCase() === pair.question.toLowerCase() && p.connectionId === pair.connectionId);
        if (existing >= 0) {
            this.pairs[existing] = pair;
        } else {
            this.pairs.push(pair);
        }

        // Trim to max size
        if (this.pairs.length > MAX_PAIRS) {
            this.pairs = this.pairs.slice(-MAX_PAIRS);
        }

        this._save();
    }

    /**
     * Find the top-K most similar Q&A pairs for a given question.
     * Uses keyword overlap scoring (simple but effective without embeddings).
     * @param {string} question - User's question
     * @param {string} connectionId - Current connection
     * @param {number} topK - Number of results (default 3)
     * @returns {Array<{question, sql, score}>}
     */
    findSimilar(question, connectionId, topK = 3) {
        const queryKeywords = this._extractKeywords(question);
        if (queryKeywords.length === 0) return [];

        const scored = this.pairs
            .filter(p => p.connectionId === String(connectionId) || p.dbType)
            .map(p => {
                const score = this._similarity(queryKeywords, p.keywords);
                // Bonus for same connection
                const connBonus = p.connectionId === String(connectionId) ? 0.1 : 0;
                return { question: p.question, sql: p.sql, score: score + connBonus };
            })
            .filter(p => p.score > 0.2)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        return scored;
    }

    /**
     * Get total stored pairs count.
     */
    size() { return this.pairs.length; }

    // ── Private ──

    _extractKeywords(text) {
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'that', 'this', 'these', 'those', 'it', 'its', 'me', 'my', 'i', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how', 'if', 'then', 'else', 'about']);
        return text.toLowerCase()
            .replace(/[^a-z0-9_\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
    }

    _similarity(a, b) {
        if (a.length === 0 || b.length === 0) return 0;
        const setA = new Set(a);
        const setB = new Set(b);
        const intersection = [...setA].filter(x => setB.has(x)).length;
        const union = new Set([...setA, ...setB]).size;
        return intersection / union; // Jaccard similarity
    }

    _load() {
        try {
            if (fs.existsSync(STORE_FILE)) {
                this.pairs = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
            }
        } catch (e) { this.pairs = []; }
    }

    _save() {
        try {
            fs.writeFileSync(STORE_FILE, JSON.stringify(this.pairs, null, 2));
        } catch (e) { /* non-critical */ }
    }
}

// Singleton
module.exports = new NLQVectorStore();
