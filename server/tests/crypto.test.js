/**
 * @file tests/crypto.test.js
 * @description Tests for centralised credential encryption (AES-256-GCM)
 * and backward compatibility with the legacy CBC format.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const { encrypt, decrypt, isCurrentFormat } = require('../services/crypto');
const config = require('../config');

/** Reproduce the old CBC format so we can prove decrypt() still reads it. */
function legacyEncrypt(text) {
    const key = crypto.scryptSync(config.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

describe('crypto service', () => {
    test('round-trips a value', () => {
        const secret = 'sup3r-s3cret-p@ssword!';
        const enc = encrypt(secret);
        expect(decrypt(enc)).toBe(secret);
    });

    test('produces the v2 (GCM) format', () => {
        const enc = encrypt('hello');
        expect(isCurrentFormat(enc)).toBe(true);
        expect(enc.startsWith('v2:')).toBe(true);
        expect(enc.split(':')).toHaveLength(5);
    });

    test('uses a fresh salt/iv each time (different ciphertext)', () => {
        const a = encrypt('same-input');
        const b = encrypt('same-input');
        expect(a).not.toBe(b);
        expect(decrypt(a)).toBe('same-input');
        expect(decrypt(b)).toBe('same-input');
    });

    test('detects tampering via the auth tag', () => {
        const enc = encrypt('important');
        const parts = enc.split(':');
        // Flip a byte in the ciphertext.
        const cipherBuf = Buffer.from(parts[4], 'hex');
        cipherBuf[0] = cipherBuf[0] ^ 0xff;
        parts[4] = cipherBuf.toString('hex');
        const tampered = parts.join(':');
        expect(() => decrypt(tampered)).toThrow();
    });

    test('decrypts legacy CBC values (backward compatibility)', () => {
        const secret = 'legacy-password-123';
        const legacy = legacyEncrypt(secret);
        expect(isCurrentFormat(legacy)).toBe(false);
        expect(decrypt(legacy)).toBe(secret);
    });

    test('returns empty string for empty/null input', () => {
        expect(decrypt('')).toBe('');
        expect(decrypt(null)).toBe('');
        expect(decrypt(undefined)).toBe('');
    });
});
