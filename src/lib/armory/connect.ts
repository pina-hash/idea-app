/**
 * CONNECTING A COMPUTER TO ARMORY: the input rules and the ONE redirect target
 * (contract section 3). Plain data and pure functions, so the confirm page and
 * the server route ask the same questions and the tests can ask them too.
 *
 * The rules are the agent's own fake site's (`FakeIdeaBosco.Validate` in
 * pina-hash/idea-armory at b18791d): a port from 1024 to 65535, a state of 1 to
 * 256 base64url characters, a challenge of exactly 43 (a base64url SHA-256),
 * and a device name of 1 to 100 characters after trimming.
 */

export const CONNECT_PORT_MIN = 1024;
export const CONNECT_PORT_MAX = 65535;
export const CONNECT_CODE_LIFETIME_MS = 2 * 60 * 1000;

export interface ConnectRequest {
	port: number;
	state: string;
	challenge: string;
	device: string;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** A JSON number, or a string of decimal digits only (no sign, space, or hex). */
export function parseConnectPort(value: unknown): number | null {
	if (typeof value === 'number') return Number.isInteger(value) ? value : null;
	if (typeof value === 'string' && /^[0-9]{1,5}$/.test(value)) return Number(value);
	return null;
}

/** Null means valid; otherwise the reason, in words. */
export function validateConnect(
	port: unknown,
	state: unknown,
	challenge: unknown,
	device: unknown
): { ok: true; request: ConnectRequest } | { ok: false; problem: string } {
	const p = parseConnectPort(port);
	if (p === null || p < CONNECT_PORT_MIN || p > CONNECT_PORT_MAX) {
		return { ok: false, problem: 'port must be an integer from 1024 to 65535.' };
	}
	if (typeof state !== 'string' || state.length === 0 || state.length > 256 || !BASE64URL.test(state)) {
		return { ok: false, problem: 'state must be 1 to 256 base64url characters.' };
	}
	if (typeof challenge !== 'string' || challenge.length !== 43 || !BASE64URL.test(challenge)) {
		return { ok: false, problem: 'challenge must be 43 base64url characters.' };
	}
	const name = typeof device === 'string' ? device.trim() : '';
	if (name.length === 0 || name.length > 100) {
		return { ok: false, problem: 'device must be a name of 1 to 100 characters.' };
	}
	return { ok: true, request: { port: p, state, challenge, device: name } };
}

/**
 * THE ONLY REDIRECT TARGET THIS SITE EVER SENDS A CONNECT CODE TO.
 *
 * Built from a PORT and nothing else: no host, scheme or path arrives from the
 * request, so there is nothing to smuggle a different host through. The result
 * is then checked by `isLoopbackCallback`, which is the second, independent
 * refusal (the shape `_safeNext` in the OAuth callback takes).
 */
export function loopbackCallbackUrl(port: number, state: string, code: string): string | null {
	if (!Number.isInteger(port) || port < CONNECT_PORT_MIN || port > CONNECT_PORT_MAX) return null;
	const url = `http://127.0.0.1:${port}/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`;
	return isLoopbackCallback(url) ? url : null;
}

/**
 * True only for `http://127.0.0.1:<1024-65535>/callback?...`, compared as TEXT
 * as well as parsed. The text check matters: a URL parser normalises
 * `http://2130706433/` and `http://0x7f.1/` to 127.0.0.1, so a parse-only check
 * would wave through a string whose spelling nobody reviewed.
 */
export function isLoopbackCallback(raw: string): boolean {
	const match = /^http:\/\/127\.0\.0\.1:([0-9]{4,5})\/callback\?[A-Za-z0-9_\-=&%.~]*$/.exec(raw);
	if (!match) return false;
	const port = Number(match[1]);
	if (port < CONNECT_PORT_MIN || port > CONNECT_PORT_MAX) return false;
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return false;
	}
	return (
		parsed.protocol === 'http:' &&
		parsed.hostname === '127.0.0.1' &&
		parsed.port === match[1] &&
		parsed.username === '' &&
		parsed.password === '' &&
		parsed.pathname === '/callback' &&
		parsed.hash === ''
	);
}
