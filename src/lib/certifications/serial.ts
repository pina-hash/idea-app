/**
 * Certificate serials: 80 random bits in Crockford base32, written as
 * `IDEA-XXXX-XXXX-XXXX-XXXX`. This is the ONE implementation of the format;
 * the database's CHECK constraint (`cert_awards.serial`, 0263) carries the
 * same regular expression and `tests/cert-serial.test.ts` holds the two to one
 * corpus.
 *
 * Crockford's alphabet drops I, L, O and U so a serial read over the phone or
 * off a photocopy cannot be misread; `normalizeSerial` folds the common
 * mistakes back (I and L to 1, O to 0) before the lookup.
 */

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SERIAL_PREFIX = 'IDEA';
export const SERIAL_RE = /^IDEA(-[0-9A-HJKMNP-TV-Z]{4}){4}$/;
/** The SQL spelling of the same rule, for the migration to copy verbatim. */
export const SERIAL_SQL_RE = "^IDEA(-[0-9A-HJKMNP-TV-Z]{4}){4}$";

/** 80 random bits as 16 Crockford characters. `bytes` must hold exactly 10. */
export function encodeSerialBody(bytes: Uint8Array): string {
	if (bytes.length !== 10) throw new Error('A serial body is exactly 10 bytes (80 bits)');
	let bits = 0;
	let acc = 0;
	let out = '';
	for (const b of bytes) {
		acc = (acc << 8) | b;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			out += CROCKFORD[(acc >>> bits) & 31];
		}
	}
	// 80 bits divide by 5 exactly, so nothing is left over.
	return out;
}

/** `IDEA-XXXX-XXXX-XXXX-XXXX` from 10 random bytes. */
export function formatSerial(bytes: Uint8Array): string {
	const body = encodeSerialBody(bytes);
	return `${SERIAL_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

/**
 * A fresh serial. Uses Web Crypto so it works in Node 20+ and the browser;
 * the award route is the only caller that matters, and it runs on the server.
 */
export function newSerial(random: (n: number) => Uint8Array = defaultRandom): string {
	return formatSerial(random(10));
}

function defaultRandom(n: number): Uint8Array {
	const bytes = new Uint8Array(n);
	globalThis.crypto.getRandomValues(bytes);
	return bytes;
}

/**
 * What a person typed, folded to the one spelling: uppercase, hyphens and
 * spaces dropped, an optional `IDEA` prefix removed, I/L to 1 and O to 0, then
 * regrouped. Returns null when what is left is not 16 Crockford characters.
 */
export function normalizeSerial(input: string): string | null {
	let s = input.toUpperCase().replace(/[\s-]+/g, '');
	if (s.startsWith(SERIAL_PREFIX)) s = s.slice(SERIAL_PREFIX.length);
	s = s.replace(/[IL]/g, '1').replace(/O/g, '0');
	if (s.length !== 16) return null;
	for (const ch of s) if (!CROCKFORD.includes(ch)) return null;
	return `${SERIAL_PREFIX}-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}

export function isSerial(value: string): boolean {
	return SERIAL_RE.test(value);
}
