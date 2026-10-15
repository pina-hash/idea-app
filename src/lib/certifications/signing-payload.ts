/**
 * The bytes an award's Ed25519 signature covers, and the ONE implementation
 * of how they are built. The server signs them (`$lib/server/certifications/
 * signing.ts`), the verify page re-checks them, and anyone with the published
 * public key can reproduce them from the verify page's own answer.
 *
 * The payload is JSON with the keys in THIS order and no whitespace. The
 * database stores the same object as jsonb (`cert_awards.signed_payload`) and
 * compares VALUES, never bytes, because jsonb reorders keys; so the canonical
 * bytes exist only here. `tests/cert-signing-payload.test.ts` pins a golden
 * byte string so a change here cannot go unnoticed.
 *
 * Pure: Web Crypto only, so it runs in Node and in the browser.
 */
import type { SignedPayload } from './types';

export const SIGNED_PAYLOAD_VERSION = 1 as const;
export const SIGNED_PAYLOAD_KEYS = [
	'v',
	'serial',
	'code',
	'level',
	'holder_name',
	'email_sha256',
	'awarded_at',
	'certifier_name'
] as const;

/** lower-case hex SHA-256 of the lowercased, trimmed email. */
export async function emailSha256(email: string): Promise<string> {
	const bytes = new TextEncoder().encode(email.trim().toLowerCase());
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** ISO 8601 in UTC with a `Z` and no fractional seconds, the one spelling. */
export function canonicalInstant(at: string | Date): string {
	const d = typeof at === 'string' ? new Date(at) : at;
	if (Number.isNaN(d.getTime())) throw new Error('canonicalInstant: not a date');
	return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface SignedPayloadInput {
	serial: string;
	code: string;
	level: number;
	holder_name: string;
	email: string;
	awarded_at: string | Date;
	certifier_name: string;
}

export async function buildSignedPayload(input: SignedPayloadInput): Promise<SignedPayload> {
	return {
		v: SIGNED_PAYLOAD_VERSION,
		serial: input.serial,
		code: input.code,
		level: input.level,
		holder_name: input.holder_name,
		email_sha256: await emailSha256(input.email),
		awarded_at: canonicalInstant(input.awarded_at),
		certifier_name: input.certifier_name
	};
}

/** The exact bytes that are signed: keys in order, no whitespace, UTF-8. */
export function canonicalPayload(p: SignedPayload): Uint8Array {
	const ordered: Record<string, unknown> = {};
	for (const k of SIGNED_PAYLOAD_KEYS) ordered[k] = p[k];
	return new TextEncoder().encode(JSON.stringify(ordered));
}

/** Reads a stored payload back into the canonical shape, or null if it is not one. */
export function readSignedPayload(value: unknown): SignedPayload | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (v.v !== 1) return null;
	for (const k of ['serial', 'code', 'holder_name', 'email_sha256', 'awarded_at', 'certifier_name']) {
		if (typeof v[k] !== 'string') return null;
	}
	if (typeof v.level !== 'number' || !Number.isInteger(v.level)) return null;
	return {
		v: 1,
		serial: v.serial as string,
		code: v.code as string,
		level: v.level,
		holder_name: v.holder_name as string,
		email_sha256: v.email_sha256 as string,
		awarded_at: v.awarded_at as string,
		certifier_name: v.certifier_name as string
	};
}
