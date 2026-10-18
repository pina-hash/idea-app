/**
 * THE CONNECTOR'S SMALL CRYPTOGRAPHY, in one place: opaque tokens, their
 * stored digests, the PKCE check, and the canonical JSON every derived key and
 * argument hash is taken over. Pure; nothing here touches a network or a
 * database.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function base64url(bytes: Buffer): string {
	return bytes.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function sha256Hex(text: string): string {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 32 random bytes, base64url: an access token, a refresh token, a code. */
export function opaqueToken(random: (n: number) => Buffer = randomBytes): string {
	return base64url(random(32));
}

/** RFC 7636 S256 over the ASCII bytes of the verifier. */
export function s256(verifier: string): string {
	return base64url(createHash('sha256').update(Buffer.from(verifier, 'ascii')).digest());
}

/** RFC 7636 section 4.1: 43 to 128 characters of the unreserved set. */
export const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
export const PKCE_CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

export function pkceMatches(verifier: string, challenge: string): boolean {
	if (!PKCE_VERIFIER.test(verifier) || !PKCE_CHALLENGE.test(challenge)) return false;
	const a = Buffer.from(s256(verifier));
	const b = Buffer.from(challenge);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** JSON with object keys sorted at every level, so equal values hash equal. */
export function canonical(value: unknown): string {
	if (value === undefined) return 'null';
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	const keys = Object.keys(value as Record<string, unknown>)
		.filter((k) => (value as Record<string, unknown>)[k] !== undefined)
		.sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
