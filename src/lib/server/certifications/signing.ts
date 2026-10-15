import {
	createHash,
	createPrivateKey,
	createPublicKey,
	randomBytes,
	sign as nodeSign,
	verify as nodeVerify,
	type KeyObject
} from 'node:crypto';
import { env } from '$env/dynamic/private';
import { canonicalPayload } from '$lib/certifications/signing-payload';
import type { SignedPayload } from '$lib/certifications/types';

/**
 * THE ONE READER OF `CERT_SIGNING_PRIVATE_KEY`, AND THE ONLY PLACE AN AWARD IS
 * SIGNED (ledger 0391, `docs/CERTIFICATIONS.md` "Signed serials").
 *
 * Ed25519 through Node's own `node:crypto`: no dependency, and the same
 * primitive every verifier in the world has. The key exists only in a server
 * environment variable, read AT CALL TIME (never at import) so a deployment
 * that sets it needs no rebuild and one that lacks it still builds and still
 * serves every other page. Nothing here prints, logs or returns the private
 * bytes, and `generateSigningKey` is for a terminal and a /dev harness, never
 * for a route.
 *
 * TWO INPUT FORMATS, BOTH ACCEPTED, so Mr. Pina can paste whichever a tool
 * handed him:
 *
 *   1. A PKCS8 PEM (`-----BEGIN PRIVATE KEY-----`), as `openssl genpkey
 *      -algorithm ed25519` writes it.
 *   2. The raw 32 byte Ed25519 SEED, base64 or base64url, as a password
 *      manager or `generateSigningKey()` writes it. A PKCS8 wrapper for an
 *      Ed25519 seed is a fixed 16 byte prefix followed by the seed (RFC 8410),
 *      so the DER is built here rather than asked of a library.
 *
 * `key_id` is the first eight hex characters of SHA-256 over the RAW 32 byte
 * public key (not the SPKI DER), which is what `DATA_MODEL.md` says and what
 * anybody checking a certificate against the published key can recompute.
 *
 * WHAT IS SIGNED is `canonicalPayload()` in `$lib/certifications/signing-payload.ts`,
 * the one spelling of the bytes; this module never builds a payload of its own.
 */

/** RFC 8410 PKCS8 prefix for an Ed25519 private key: 48 bytes total with the seed. */
export const ED25519_PKCS8_PREFIX_HEX = '302e020100300506032b657004220420';
/** The SPKI DER of an Ed25519 public key is 12 bytes of header then the 32 raw bytes. */
const SPKI_PREFIX_LEN = 12;
const SEED_BYTES = 32;

export type SigningKey =
	| { ok: true; privateKey: KeyObject; publicKey: KeyObject; keyId: string }
	| { ok: false; reason: 'unset' | 'invalid' };

/** The raw 32 byte public key out of an Ed25519 `KeyObject`. */
export function rawPublicKey(publicKey: KeyObject): Buffer {
	const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
	return der.subarray(der.length - SEED_BYTES);
}

/** First 8 hex of sha256(raw public key). */
export function keyIdOf(publicKey: KeyObject): string {
	return createHash('sha256').update(rawPublicKey(publicKey)).digest('hex').slice(0, 8);
}

/** The SPKI PEM the verify page publishes. */
export function publicKeyPem(key: KeyObject | Extract<SigningKey, { ok: true }>): string {
	const publicKey = 'publicKey' in key ? key.publicKey : key;
	return publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

/** Base64 or base64url, padded or not, to bytes; null when it is neither. */
function decodeBase64Flexible(value: string): Buffer | null {
	const compact = value.replace(/\s+/g, '');
	if (!compact || !/^[A-Za-z0-9+/_-]+=*$/.test(compact)) return null;
	const standard = compact.replace(/-/g, '+').replace(/_/g, '/');
	const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
	try {
		const bytes = Buffer.from(padded, 'base64');
		// A re-encode that does not round-trip means the input was not base64.
		if (bytes.toString('base64').replace(/=+$/, '') !== standard.replace(/=+$/, '')) return null;
		return bytes;
	} catch {
		return null;
	}
}

function keyFromSeed(seed: Buffer): KeyObject {
	const der = Buffer.concat([Buffer.from(ED25519_PKCS8_PREFIX_HEX, 'hex'), seed]);
	return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

/**
 * Pure: turns the VALUE of the variable into a key, or says why not. The
 * reader below hands it the environment; the tests hand it fixtures.
 */
export function parseSigningKey(value: string | null | undefined): SigningKey {
	const text = (value ?? '').trim();
	if (!text) return { ok: false, reason: 'unset' };
	try {
		let privateKey: KeyObject;
		if (text.includes('-----BEGIN')) {
			privateKey = createPrivateKey({ key: text, format: 'pem' });
		} else {
			const bytes = decodeBase64Flexible(text);
			if (!bytes || bytes.length !== SEED_BYTES) return { ok: false, reason: 'invalid' };
			privateKey = keyFromSeed(bytes);
		}
		if (privateKey.asymmetricKeyType !== 'ed25519') return { ok: false, reason: 'invalid' };
		// The installed types admit neither a KeyObject nor a PKCS8 DER here; the
		// JWK form is typed, and only the public half (kty, crv, x) is handed over.
		const jwk = privateKey.export({ format: 'jwk' }) as { kty?: string; crv?: string; x?: string };
		const publicKey = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, format: 'jwk' });
		return { ok: true, privateKey, publicKey, keyId: keyIdOf(publicKey) };
	} catch {
		return { ok: false, reason: 'invalid' };
	}
}

/** Reads `CERT_SIGNING_PRIVATE_KEY` now, never at import. */
export function readSigningKey(): SigningKey {
	return parseSigningKey(env.CERT_SIGNING_PRIVATE_KEY);
}

/** The name `DATA_MODEL.md` uses for the same read. */
export const signingKey = readSigningKey;

/** Base64 Ed25519 signature over the canonical payload bytes. */
export function signPayload(payload: SignedPayload, privateKey: KeyObject): string {
	return nodeSign(null, canonicalPayload(payload), privateKey).toString('base64');
}

/**
 * True only when `signatureB64` is a valid Ed25519 signature over the canonical
 * bytes of `payload` under `publicKey` (an SPKI PEM or a KeyObject). Any
 * malformed input is false, never a throw: a verifier that throws on a
 * hand-typed signature is a verifier that can be made to 500.
 */
export function verifySignature(
	payload: SignedPayload,
	signatureB64: string,
	publicKey: string | KeyObject
): boolean {
	try {
		const key = typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey;
		if (key.asymmetricKeyType !== 'ed25519') return false;
		const signature = Buffer.from(signatureB64, 'base64');
		if (signature.length !== 64) return false;
		return nodeVerify(null, canonicalPayload(payload), key, signature);
	} catch {
		return false;
	}
}

/**
 * A fresh seed as base64, for Mr. Pina's one hand step and for a /dev
 * harness. NO ROUTE CALLS THIS AND NONE MAY: the value it returns is the
 * private key.
 */
export function generateSigningKey(): string {
	return randomBytes(SEED_BYTES).toString('base64');
}
