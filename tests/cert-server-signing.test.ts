// tests/cert-server-signing.test.ts
//
// THE AWARD SIGNATURE (ledger 0391). Every claim here fails silently in
// production: a key_id that drifted, a seed format that stopped parsing, a
// verifier that answered true for an altered field. The expected values come
// from node:crypto directly, never from the module under test.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
	ED25519_PKCS8_PREFIX_HEX,
	generateSigningKey,
	keyIdOf,
	parseSigningKey,
	publicKeyPem,
	rawPublicKey,
	readSigningKey,
	signPayload,
	signingKey,
	verifySignature
} from '../src/lib/server/certifications/signing';
import { canonicalPayload } from '../src/lib/certifications/signing-payload';
import type { SignedPayload } from '../src/lib/certifications/types';

const SEED = Buffer.from('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20', 'hex');
const PKCS8_DER = Buffer.concat([Buffer.from(ED25519_PKCS8_PREFIX_HEX, 'hex'), SEED]);
const privateKey = createPrivateKey({ key: PKCS8_DER, format: 'der', type: 'pkcs8' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
// A private key PEM handed to createPublicKey yields the public half (Node derives it).
const SPKI_DER = createPublicKey(PEM).export({ type: 'spki', format: 'der' }) as Buffer;
/** sha256 of the raw 32 byte public key, first 8 hex: computed here, not by the module. */
const EXPECTED_KEY_ID = createHash('sha256').update(SPKI_DER.subarray(SPKI_DER.length - 32)).digest('hex').slice(0, 8);

const payload: SignedPayload = {
	v: 1,
	serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB',
	code: 'MILL-1',
	level: 1,
	holder_name: 'Wren Hollis',
	email_sha256: 'a'.repeat(64),
	awarded_at: '2026-10-15T20:00:00Z',
	certifier_name: 'Mr. Pina'
};

afterEach(() => {
	delete process.env.CERT_SIGNING_PRIVATE_KEY;
});

describe('parseSigningKey', () => {
	it('accepts a PKCS8 PEM', () => {
		const key = parseSigningKey(PEM);
		expect(key.ok).toBe(true);
		if (!key.ok) return;
		expect(key.keyId).toBe(EXPECTED_KEY_ID);
		expect(rawPublicKey(key.publicKey).equals(SPKI_DER.subarray(SPKI_DER.length - 32))).toBe(true);
	});

	it('accepts the seed as base64 and as base64url, and both give the same key', () => {
		const b64 = parseSigningKey(SEED.toString('base64'));
		const b64url = parseSigningKey(SEED.toString('base64url'));
		expect(b64.ok && b64url.ok).toBe(true);
		if (!b64.ok || !b64url.ok) return;
		expect(b64.keyId).toBe(EXPECTED_KEY_ID);
		expect(b64url.keyId).toBe(EXPECTED_KEY_ID);
		expect(publicKeyPem(b64)).toBe(publicKeyPem(b64url));
		expect(publicKeyPem(b64)).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
	});

	it('answers unset for nothing and whitespace, invalid for anything else', () => {
		expect(parseSigningKey(undefined)).toEqual({ ok: false, reason: 'unset' });
		expect(parseSigningKey('')).toEqual({ ok: false, reason: 'unset' });
		expect(parseSigningKey('   \n')).toEqual({ ok: false, reason: 'unset' });
		expect(parseSigningKey('not a key')).toEqual({ ok: false, reason: 'invalid' });
		expect(parseSigningKey(Buffer.alloc(31, 1).toString('base64'))).toEqual({ ok: false, reason: 'invalid' });
		expect(parseSigningKey(Buffer.alloc(33, 1).toString('base64'))).toEqual({ ok: false, reason: 'invalid' });
		expect(parseSigningKey('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----')).toEqual({ ok: false, reason: 'invalid' });
	});

	it('refuses a non-Ed25519 PKCS8 key', () => {
		// An RSA key parses as PKCS8 but is the wrong algorithm.
		const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
		expect(parseSigningKey(rsa)).toEqual({ ok: false, reason: 'invalid' });
	});
});

describe('readSigningKey', () => {
	it('reads CERT_SIGNING_PRIVATE_KEY at call time and answers unset without it', () => {
		delete process.env.CERT_SIGNING_PRIVATE_KEY;
		expect(readSigningKey()).toEqual({ ok: false, reason: 'unset' });
		expect(signingKey()).toEqual({ ok: false, reason: 'unset' });
		process.env.CERT_SIGNING_PRIVATE_KEY = SEED.toString('base64');
		const key = readSigningKey();
		expect(key.ok).toBe(true);
		if (key.ok) expect(key.keyId).toBe(EXPECTED_KEY_ID);
	});
});

describe('sign and verify', () => {
	it('signs the canonical bytes and verifies against the SPKI PEM', () => {
		const key = parseSigningKey(SEED.toString('base64'));
		if (!key.ok) throw new Error('fixture');
		const signature = signPayload(payload, key.privateKey);
		// Ed25519 is deterministic: node's own signature over the same bytes is the control.
		expect(signature).toBe(nodeSign(null, canonicalPayload(payload), privateKey).toString('base64'));
		expect(Buffer.from(signature, 'base64').length).toBe(64);
		expect(verifySignature(payload, signature, publicKeyPem(key))).toBe(true);
		expect(verifySignature(payload, signature, key.publicKey)).toBe(true);
	});

	it('an altered field, a wrong key, or a malformed signature all answer false and never throw', () => {
		const key = parseSigningKey(SEED.toString('base64'));
		if (!key.ok) throw new Error('fixture');
		const signature = signPayload(payload, key.privateKey);
		const pem = publicKeyPem(key);
		expect(verifySignature({ ...payload, holder_name: 'Wren Hollis ' }, signature, pem)).toBe(false);
		expect(verifySignature({ ...payload, level: 2 }, signature, pem)).toBe(false);
		expect(verifySignature({ ...payload, serial: 'IDEA-7K3Q-M9XD-2HTR-W4PC' }, signature, pem)).toBe(false);
		const other = parseSigningKey(generateSigningKey());
		if (!other.ok) throw new Error('fixture');
		expect(verifySignature(payload, signature, publicKeyPem(other))).toBe(false);
		expect(verifySignature(payload, 'not base64 at all!!', pem)).toBe(false);
		expect(verifySignature(payload, Buffer.alloc(10).toString('base64'), pem)).toBe(false);
		expect(verifySignature(payload, signature, 'not a pem')).toBe(false);
	});

	it('generateSigningKey makes a fresh 32 byte seed that parses, and keyIdOf is stable', () => {
		const seed = generateSigningKey();
		expect(Buffer.from(seed, 'base64').length).toBe(32);
		const a = parseSigningKey(seed);
		const b = parseSigningKey(seed);
		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.keyId).toBe(b.keyId);
		expect(keyIdOf(a.publicKey)).toMatch(/^[0-9a-f]{8}$/);
		expect(generateSigningKey()).not.toBe(seed);
	});
});
