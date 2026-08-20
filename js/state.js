/**
 * @file state.js
 * @description Centralized application state with localStorage persistence.
 * @module YDB.State
 *
 * All mutable app state lives here. Modules read/write via YDB.State.
 * Call save() after modifying connections or history to persist.
 */

YDB.State = {

    // ── Auth ──────────────────────────────────────────────────
    /** @type {string|null} Current logged-in username */
    user: null,

    // ── Connections ───────────────────────────────────────────
    /** @type {Array} All database connections */
    connections: [],
    /** @type {Object|null} Currently selected connection */
    activeConnection: null,
    /** @type {string|null} Currently selected table name */
    activeTable: null,

    // ── Navigation ────────────────────────────────────────────
    /** @type {string} Active tab name */
    activeTab: 'explorer',

    // ── SQL Editor ────────────────────────────────────────────
    /** @type {Array} Editor tab objects [{id, name, content}] */
    editorTabs: [{ id: 1, name: 'Query 1', content: '' }],
    /** @type {number} Active editor tab ID */
    activeEditorTab: 1,
    /** @type {number} Counter for generating unique tab IDs */
    editorTabCounter: 1,

    // ── Visual Builder ────────────────────────────────────────
    /** @type {Array} Tables currently on the canvas */
    canvasTables: [],
    /** @type {Array} Join definitions between canvas tables */
    canvasJoins: [],
    /** @type {number} Next auto-increment ID for canvas tables */
    canvasNextId: 1,
    /** @type {number} Current canvas zoom level (0.3 - 1.5) */
    canvasZoom: 1,
    /** @type {Array|null} Pending join suggestions awaiting user action */
    pendingSuggestions: null,

    // ── Query History ─────────────────────────────────────────
    /** @type {Array} Executed query log */
    queryHistory: [],

    // ── Pagination ────────────────────────────────────────────
    /** @type {Object} Per-container pagination state cache */
    pagination: {},

    // ── Theme ─────────────────────────────────────────────────
    /** @type {string} 'dark' or 'light' */
    theme: localStorage.getItem('ydb-theme') || 'dark',

    // ── Persistence Methods ───────────────────────────────────

    /**
     * Save connections and history to localStorage.
     */
    save: function () {
        localStorage.setItem('ydb-connections', JSON.stringify(this.connections));
        localStorage.setItem('ydb-history', JSON.stringify(this.queryHistory));
    },

    /**
     * Load persisted data from localStorage.
     * Falls back to sample connections if nothing saved.
     */
    load: function () {
        var c = localStorage.getItem('ydb-connections');
        this.connections = c ? JSON.parse(c) : [];

        var h = localStorage.getItem('ydb-history');
        this.queryHistory = h ? JSON.parse(h) : [];
    }
};
