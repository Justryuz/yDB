/**
 * @file tests/ssrf-guard.test.js
 * @description Tests for the SSRF guard used before outbound DB connections.
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

const { assertHostAllowed, isPrivateIPv4, isPrivateIPv6, isMetadataIP } = require('../services/ssrf-guard');

describe('ssrf-guard classification', () => {
    test('identifies private IPv4 ranges', () => {
        expect(isPrivateIPv4('10.0.0.5')).toBe(true);
        expect(isPrivateIPv4('172.16.0.1')).toBe(true);
        expect(isPrivateIPv4('172.31.255.255')).toBe(true);
        expect(isPrivateIPv4('192.168.1.1')).toBe(true);
        expect(isPrivateIPv4('127.0.0.1')).toBe(true);
        expect(isPrivateIPv4('169.254.1.1')).toBe(true);
    });

    test('treats public IPv4 as non-private', () => {
        expect(isPrivateIPv4('8.8.8.8')).toBe(false);
        expect(isPrivateIPv4('1.1.1.1')).toBe(false);
        expect(isPrivateIPv4('172.32.0.1')).toBe(false);
    });

    test('identifies private IPv6', () => {
        expect(isPrivateIPv6('::1')).toBe(true);
        expect(isPrivateIPv6('fe80::1')).toBe(true);
        expect(isPrivateIPv6('fd00::1')).toBe(true);
    });

    test('identifies cloud metadata addresses', () => {
        expect(isMetadataIP('169.254.169.254')).toBe(true);
        expect(isMetadataIP('100.100.100.200')).toBe(true);
        expect(isMetadataIP('8.8.8.8')).toBe(false);
    });
});

describe('assertHostAllowed', () => {
    test('always blocks the cloud metadata endpoint', async () => {
        await expect(assertHostAllowed('169.254.169.254')).rejects.toThrow(/metadata/i);
    });

    test('allows a public IP by default', async () => {
        await expect(assertHostAllowed('8.8.8.8')).resolves.toBeUndefined();
    });

    test('allows private IPs by default (self-hosted DB tool)', async () => {
        await expect(assertHostAllowed('10.0.0.5')).resolves.toBeUndefined();
        await expect(assertHostAllowed('192.168.1.10')).resolves.toBeUndefined();
    });

    test('rejects empty host', async () => {
        await expect(assertHostAllowed('')).rejects.toThrow(/host is required/i);
    });
});
