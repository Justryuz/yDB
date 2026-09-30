/**
 * @file adapters/ssl.js
 * @description Shared TLS policy for database adapters.
 *
 * Previous behaviour silently fell back to `rejectUnauthorized: false`,
 * disabling certificate verification and exposing connections to MITM.
 *
 * New policy:
 *   - SSL is enabled by default with certificate verification ON.
 *   - `opts.ssl === false`            → no SSL at all (plaintext).
 *   - `opts.sslRejectUnauthorized === false` (or `opts.sslInsecure === true`)
 *                                     → SSL on, verification OFF (explicit opt-in
 *                                       for self-signed certs; logs a warning).
 *   - A CA certificate can be supplied via `opts.sslCa` to verify self-signed
 *     certs the right way instead of disabling verification.
 */

/**
 * @param {object} opts adapter options
 * @returns {object|undefined} a `ssl` config for the pg/mysql driver, or
 *   undefined when SSL is disabled.
 */
function resolveSsl(opts = {}) {
    if (opts.ssl === false) return undefined;

    const insecure = opts.sslRejectUnauthorized === false || opts.sslInsecure === true;

    if (insecure) {
        console.warn('[SSL] Certificate verification is DISABLED for this connection (rejectUnauthorized:false). This is vulnerable to MITM — supply a CA certificate instead where possible.');
        return { rejectUnauthorized: false };
    }

    const ssl = { rejectUnauthorized: true };
    if (opts.sslCa) ssl.ca = opts.sslCa;
    return ssl;
}

module.exports = { resolveSsl };
