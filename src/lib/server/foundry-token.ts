import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * THE BUNDLE TOKEN: the only thing that authorizes a read on the apps host.
 *
 * WHY A TOKEN AT ALL, rather than the viewer's session. The apps host is a
 * different site, so the viewer's cookies are not sent to it -- that is the
 * entire point of the origin split. So the proxy has no session to read, and
 * "may this person see this bundle" has to be decided somewhere that does have
 * one. It is decided on the MAIN host, at mint time, by a route that reads the
 * caller's session and the row; the token is that decision, carried across.
 *
 * IT SITS IN THE PATH, NOT IN A QUERY STRING, and that is a resolution
 * argument rather than a security one: every relative request a bundle makes
 * (`./app.js`, `assets/logo.png`, a fetch of its own data file) resolves under
 * `/r/<token>/` on its own, with the bundle never knowing a token exists. A
 * query string would be dropped by the browser's own relative resolution and
 * every second request would arrive unauthenticated.
 *
 * THE PAYLOAD IS BINARY AND FIXED-WIDTH, 53 bytes, so there is no parser and
 * no separator to get wrong:
 *
 *   [0]      KIND byte (see below)
 *   [1..17)  app id, 16 raw bytes
 *   [17..33) version id, 16 raw bytes
 *   [33..49) viewer id, 16 raw bytes
 *   [49..53) expiry, uint32 big-endian, seconds since the epoch
 *
 * followed by a 32-byte HMAC-SHA256 of exactly those 53 bytes, and the whole
 * 85 bytes base64url-encoded. base64url uses only `A-Za-z0-9-_`, so the token
 * carries no `/`, no `.` and nothing needing percent-encoding: `/r/<token>/<path>`
 * splits on the first slash after the token with no ambiguity and no decoding
 * step that could differ between us and the browser.
 *
 * THE EXPIRY IS INSIDE THE SIGNED BYTES, which is what makes it an expiry
 * rather than a suggestion. Thirty minutes: long enough for a lesson, short
 * enough that a token pasted into a chat stops working the same period.
 *
 * VERIFICATION IS CONSTANT-TIME over the signature (`timingSafeEqual`, with the
 * length checked first because it throws on a mismatch). It is deliberately
 * NOT the last word on access: the proxy re-reads the app and version rows
 * afterwards, so a token whose app has since been hidden, or whose version is
 * no longer the published one, is refused even though its signature is
 * perfectly good. A token says who asked and for what; the database still says
 * yes.
 */

/**
 * THE KIND BYTE, WHICH IS THE OLD VERSION BYTE WITH ITS REAL JOB WRITTEN DOWN.
 *
 * Byte 0 has always been a signed discriminator that verification checks after
 * the signature and refuses if it does not recognise. It held one value and
 * was called a version. It now holds two, and calling it a version while it
 * discriminates PURPOSE would be a name that says the wrong thing.
 *
 *   published (1)  what every token has always been, unchanged byte for byte:
 *                  the viewer may read the app's CURRENTLY PUBLISHED version.
 *                  `resolveBundleFile` re-checks that equality on every request.
 *   review    (2)  a reviewer may read ONE NAMED version of an app whether or
 *                  not it is the published one. It exists because the review
 *                  queue has to run the build it is deciding about, and a
 *                  submitted version is by definition not published yet.
 *
 * WHY A SECOND KIND RATHER THAN RELAXING THE CHECK. The publication re-check in
 * `$lib/server/foundry-bundle` is the thing that makes a thirty-minute token
 * withdrawable inside its own lifetime; a flag that turned it off for everyone
 * would trade that for one surface's convenience. Instead the licence is IN THE
 * SIGNED BYTES, so a published token cannot be edited into a review one, and
 * the mint is the single place that decides who may hold one (admins only, and
 * it re-reads the row to say so).
 *
 * NO WIDTH CHANGE. Adding a field would have moved every offset in the layout
 * above and made every already-minted token malformed. Byte 0 was already a
 * signed value with exactly this job.
 */
export const FOUNDRY_TOKEN_KIND_BYTES = { published: 1, review: 2 } as const;

export type FoundryTokenKind = keyof typeof FOUNDRY_TOKEN_KIND_BYTES;

const KIND_BY_BYTE = new Map<number, FoundryTokenKind>(
	Object.entries(FOUNDRY_TOKEN_KIND_BYTES).map(([k, b]) => [b, k as FoundryTokenKind])
);

const PAYLOAD_BYTES = 53;
const SIGNATURE_BYTES = 32;

/** Thirty minutes, as seconds. */
export const FOUNDRY_TOKEN_TTL_SECONDS = 30 * 60;

export type FoundryTokenClaims = {
	appId: string;
	versionId: string;
	viewerId: string;
	/** What this token licenses. See {@link FOUNDRY_TOKEN_KIND_BYTES}. */
	kind: FoundryTokenKind;
	/** Seconds since the epoch. */
	expiresAt: number;
};

export type FoundryTokenFailure =
	| 'not_configured'
	| 'malformed'
	| 'bad_version'
	| 'bad_signature'
	| 'expired';

export type FoundryTokenResult =
	| { ok: true; claims: FoundryTokenClaims }
	| { ok: false; reason: FoundryTokenFailure };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A LOCAL-ONLY SECRET IS MINTED IN DEV WHEN THE ENVIRONMENT CARRIES NONE, and
 * only in dev. It lives in this process and dies with it, so a restart
 * invalidates every token the harness issued -- which is correct: a
 * development secret that survived a restart would be a development secret
 * worth stealing.
 *
 * In production an unset `FOUNDRY_TOKEN_SECRET` is NOT papered over. It
 * returns null, the mint route answers a structured `not_configured` and the
 * proxy refuses every token. A missing environment variable does not fix
 * itself, and quietly generating a per-instance secret on a platform that runs
 * many instances would produce tokens that verify on the instance that minted
 * them and nowhere else -- an intermittent failure that looks like anything
 * except a missing variable.
 *
 * The value is never logged, never returned, and never put in a message.
 */
let devSecret: Buffer | null = null;

function secret(isDev: boolean): Buffer | null {
	const configured = (env.FOUNDRY_TOKEN_SECRET ?? '').trim();
	if (configured) return Buffer.from(configured, 'utf8');
	if (!isDev) return null;
	if (!devSecret) devSecret = randomBytes(32);
	return devSecret;
}

export function foundryTokensConfigured(isDev: boolean): boolean {
	return secret(isDev) !== null;
}

/**
 * TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
 *
 * THE SHAPE OF THE CONFIGURED SECRET, NEVER THE SECRET. Presence and length
 * only -- enough to tell "unset in this runtime" from "set but not the value
 * the mint signed with", and nothing else. The mint answers 200 in the same
 * deployment, so if verification fails here the two are reading different
 * values and the length is what would say so.
 */
export function foundryTokenSecretShape(): { set: boolean; len: number } {
	const configured = (env.FOUNDRY_TOKEN_SECRET ?? '').trim();
	return { set: configured.length > 0, len: configured.length };
}

function uuidToBytes(uuid: string): Buffer | null {
	if (typeof uuid !== 'string' || !UUID_RE.test(uuid)) return null;
	return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesToUuid(bytes: Buffer): string {
	const h = bytes.toString('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function sign(payload: Buffer, key: Buffer): Buffer {
	return createHmac('sha256', key).update(payload).digest();
}

/**
 * Mints a token. Returns null when the deployment carries no secret, or when
 * any of the three ids is not a uuid -- a caller that cannot produce one has
 * not read a row, and minting over a made-up id would produce a token that
 * verifies and then resolves to nothing.
 *
 * `nowSeconds` is threaded in rather than read here so a test can mint an
 * already-expired token without waiting half an hour for one.
 */
export function mintFoundryToken(
	input: {
		appId: string;
		versionId: string;
		viewerId: string;
		/** Defaults to `published`, which is what every existing caller means. */
		kind?: FoundryTokenKind;
		ttlSeconds?: number;
		nowSeconds?: number;
	},
	isDev: boolean
): string | null {
	const key = secret(isDev);
	if (!key) return null;

	const app = uuidToBytes(input.appId);
	const version = uuidToBytes(input.versionId);
	const viewer = uuidToBytes(input.viewerId);
	if (!app || !version || !viewer) return null;

	const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
	const expiry = now + (input.ttlSeconds ?? FOUNDRY_TOKEN_TTL_SECONDS);
	// uint32 runs out in 2106. A negative or oversized expiry is a caller bug,
	// not something to silently wrap around.
	if (!Number.isInteger(expiry) || expiry < 0 || expiry > 0xffffffff) return null;

	const payload = Buffer.alloc(PAYLOAD_BYTES);
	payload[0] = FOUNDRY_TOKEN_KIND_BYTES[input.kind ?? 'published'];
	app.copy(payload, 1);
	version.copy(payload, 17);
	viewer.copy(payload, 33);
	payload.writeUInt32BE(expiry, 49);

	return Buffer.concat([payload, sign(payload, key)]).toString('base64url');
}

/**
 * Verifies a token and returns its claims.
 *
 * EVERY REFUSAL IS THE SAME SHAPE and none of them says which byte was wrong.
 * The caller turns all of them into one 404 with no body, so a token is not an
 * oracle: a tampered signature, an expired token and a token for an app that
 * does not exist are indistinguishable from outside.
 */
export function verifyFoundryToken(
	token: string,
	isDev: boolean,
	nowSeconds?: number
): FoundryTokenResult {
	const key = secret(isDev);
	if (!key) return { ok: false, reason: 'not_configured' };

	// base64url only. Anything else is refused before it reaches the decoder,
	// because Node's base64 decoder is famously forgiving -- it ignores
	// characters it does not recognise -- so `Buffer.from` would happily accept
	// a token a second implementation would read differently, or not at all.
	if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token)) {
		return { ok: false, reason: 'malformed' };
	}

	let raw: Buffer;
	try {
		raw = Buffer.from(token, 'base64url');
	} catch {
		return { ok: false, reason: 'malformed' };
	}
	if (raw.length !== PAYLOAD_BYTES + SIGNATURE_BYTES) return { ok: false, reason: 'malformed' };

	const payload = raw.subarray(0, PAYLOAD_BYTES);
	const signature = raw.subarray(PAYLOAD_BYTES);
	const expected = sign(payload, key);

	// Lengths are equal by construction here; the guard is kept because
	// timingSafeEqual THROWS on a length mismatch rather than returning false,
	// and a throw inside a request handler is a 500 where this wants a 404.
	if (signature.length !== expected.length) return { ok: false, reason: 'bad_signature' };
	if (!timingSafeEqual(signature, expected)) return { ok: false, reason: 'bad_signature' };

	// The kind byte is checked AFTER the signature deliberately: an unsigned
	// value has not earned a distinct answer. An UNRECOGNISED kind is refused
	// rather than defaulted -- a token whose first byte we do not understand
	// must not quietly become the most permissive thing we do understand.
	const kind = KIND_BY_BYTE.get(payload[0]);
	if (!kind) return { ok: false, reason: 'bad_version' };

	const expiresAt = payload.readUInt32BE(49);
	const now = nowSeconds ?? Math.floor(Date.now() / 1000);
	if (now >= expiresAt) return { ok: false, reason: 'expired' };

	return {
		ok: true,
		claims: {
			appId: bytesToUuid(payload.subarray(1, 17)),
			versionId: bytesToUuid(payload.subarray(17, 33)),
			viewerId: bytesToUuid(payload.subarray(33, 49)),
			kind,
			expiresAt
		}
	};
}
