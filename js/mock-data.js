/**
 * @file mock-data.js
 * @description Schema cache and runtime data store.
 * Previously held mock/sample data. Now acts as an in-memory cache
 * for API-fetched schemas. Modules read/write here for performance.
 *
 * When API fetches a schema, it's cached here.
 * When offline, this stays empty and modules show appropriate messages.
 */

YDB.MockData = {
    /** @type {Array} No longer used for initial data — connections come from API */
    sampleConnections: [],

    /**
     * Schema cache: { connectionId: { name, tables: { tableName: { columns, data } } } }
     * Populated by explorer.js when API fetches schema.
     */
    schemas: {},

    /**
     * Relationship cache: { connectionId: [ { from, fromCol, to, toCol } ] }
     * Can be populated by API or inferred from FK columns.
     */
    relationships: {}
};
