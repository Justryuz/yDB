/**
 * @file services/crypto.js
 * @description Centralised encryption for stored connection credentials.
 *
 * New values are encrypted with AES-256-GCM: a per-value random salt derives
 * the key (scrypt), a random IV is used, and the GCM auth tag provides
 * integrity (tamper detection). Format:
 *
 *     v2:<saltHex>:<ivHex>:<tagHex>:<cipherHex>
 *
 * Legacy values written by the old code used AES-256-CBC with a static salt
 * ('salt') and no integrity tag. Format:
 *
 *     <ivHex>:<cipherHex>
 *
 * decrypt() auto-detects the format so existing credentials keep working.
 * Anything re-encrypted (e.g. on the next connection update) upgrades to v2.
 */

const crypto = require('crypto');
const config = require('../config');

const V2_PREFIX = 'v2';
const KEY_LEN = 32;          // AES-256
const IV_LEN_GCM = 12;       // 96-bit nonce recommended for GCM
const SALT_LEN = 16;
const LEGACY_STATIC_SALT = 'salt';

/**
 * Encrypt a UTF-8 string with AES-256-GCM.
 * @param {string} text
 * @returns {string} versioned, self-describing ciphertext
 */
function encrypt(text) {
    if (text === null || text === undefined) return null;
    const salt = crypto.randomBytes(SALT_LEN);
    const key = crypto.scryptSync(config.encryptionKey, salt, KEY_LEN);
    const iv = crypto.randomBytes(IV_LEN_GCM);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
        V2_PREFIX,
        salt.toString('hex'),
        iv.toString('hex'),
        tag.toString('hex'),
        encrypted.toString('hex')
    ].join(':');
}

/**
 * Decrypt a value produced by encrypt() (v2/GCM) or by the legacy CBC path.
 * @param {string} text
 * @returns {string} plaintext
 */
function decrypt(text) {
    if (text === null || text === undefined || text === '') return '';

    const parts = String(text).split(':');

    if (parts[0] === V2_PREFIX) {
        // v2:salt:iv:tag:cipher
        const [, saltHex, ivHex, tagHex, cipherHex] = parts;
        const key = crypto.scryptSync(config.encryptionKey, Buffer.from(saltHex, 'hex'), KEY_LEN);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(cipherHex, 'hex')),
            decipher.final()
        ]);
        return decrypted.toString('utf8');
    }

    // Legacy CBC format: iv:cipher with a static salt.
    const [ivHex, encrypted] = parts;
    const key = crypto.scryptSync(config.encryptionKey, LEGACY_STATIC_SALT, KEY_LEN);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * True if the value uses the current (v2/GCM) format.
 * Useful for opportunistic re-encryption / migration.
 * @param {string} text
 * @returns {boolean}
 */
function isCurrentFormat(text) {
    return typeof text === 'string' && text.startsWith(V2_PREFIX + ':');
}

module.exports = { encrypt, decrypt, isCurrentFormat };
