/**
 * Server-side Google Drive integration for the digital notebook ($lib/server,
 * so SvelteKit refuses to bundle any of this client-side -- the coin-ledger /
 * push convention). Photo BYTES live in a folder inside a Google Shared
 * Drive; Postgres stores only the returned Drive file id (0069).
 *
 * AUTH IS OAUTH ON BEHALF OF A REAL BOSCO TECH ACCOUNT, not a service
 * account. The shared drive's Workspace policy blocks any identity outside
 * the school's domain, and a service account is an outside identity by
 * definition, so the earlier service-account approach could never be granted
 * access. Instead the chair runs the one-time consent flow at
 * /admin/drive-connect signed in as a real @boscotech.edu account; Google
 * returns a REFRESH TOKEN which is copied BY HAND into Vercel as
 * GOOGLE_DRIVE_REFRESH_TOKEN (displayed once, never logged, never stored in
 * the database). This module mints short-lived access tokens from it on
 * demand (cached until shortly before expiry) using the OAuth client in
 * GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET, and every Drive call
 * then acts AS that account.
 *
 * The scope is the FULL https://www.googleapis.com/auth/drive, not
 * drive.file: the target folder is a pre-existing folder inside the shared
 * drive that this app neither created nor obtained through a Picker flow,
 * and drive.file's per-file access model does not reliably extend to
 * creating files inside such a folder -- the same limitation the original
 * service-account module documented and worked around with the full scope.
 * The consent request
 * carries access_type=offline AND prompt=consent, both explicitly: without
 * both, Google will not reliably return a refresh token at all, only a
 * short-lived access token, and the whole flow silently produces something
 * useless.
 *
 * Uploads land in the folder NOTEBOOK_FOLDER_ID -- a folder INSIDE a shared
 * drive, not a shared-drive root -- so every call carries
 * supportsAllDrives=true; the plain endpoints pretend shared-drive content
 * does not exist and writes into a shared-drive-nested folder fail without
 * it. The current folder is the default below; GOOGLE_DRIVE_NOTEBOOK_FOLDER_ID
 * only needs setting if the folder ever moves (the COIN_LEDGER_URL
 * convention).
 *
 * ONE EGRESS POINT: this module is the only code that reads the OAuth client
 * secret or the refresh token. The connect routes call driveConsentUrl() /
 * exchangeDriveCode(); the upload routes call uploadNotebookPhoto() /
 * deleteNotebookFile(); nothing else touches the credentials.
 */

import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Google API hosts. Exported as a mutable object ONLY so the offline
 * verification harness can point them at a local mock (the real Google side
 * needs a real consent grant); production code must never write to this.
 */
export const DRIVE_ENDPOINTS = {
	auth: 'https://accounts.google.com/o/oauth2/v2/auth',
	token: 'https://oauth2.googleapis.com/token',
	upload: 'https://www.googleapis.com/upload/drive/v3/files',
	files: 'https://www.googleapis.com/drive/v3/files'
};

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

/** State cookie the two /admin/drive-connect routes share (CSRF check). */
export const DRIVE_STATE_COOKIE = 'nb_drive_oauth_state';

/**
 * Must byte-match the redirect URI registered on the OAuth client, so it is a
 * constant rather than derived from the request origin (a dev-server origin
 * would never match the registration anyway; the connect flow is a
 * production, one-time action).
 */
export const DRIVE_REDIRECT_URI = 'https://ideabosco.com/admin/drive-connect/callback';

/** The notebook photo folder inside the shared drive. */
const DEFAULT_NOTEBOOK_FOLDER_ID = '1WT0isqdSIPu1kMV142fu-6TsbP3tlmVs';

function clientId(): string {
	return (env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim();
}

function clientSecret(): string {
	return (env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim();
}

function refreshToken(): string {
	return (env.GOOGLE_DRIVE_REFRESH_TOKEN ?? '').trim();
}

export function notebookFolderId(): string {
	return (env.GOOGLE_DRIVE_NOTEBOOK_FOLDER_ID ?? '').trim() || DEFAULT_NOTEBOOK_FOLDER_ID;
}

/** The consent flow only needs the OAuth client; the refresh token is what it produces. */
export function driveConnectReady(): boolean {
	return !!(clientId() && clientSecret());
}

/** Uploads additionally need the refresh token the consent flow handed over. */
export function driveConfigured(): boolean {
	return !!(clientId() && clientSecret() && refreshToken());
}

/**
 * The Google consent URL for /admin/drive-connect. access_type=offline +
 * prompt=consent are both required for Google to issue a refresh token (see
 * the module header); do not remove either.
 */
export function driveConsentUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: clientId(),
		redirect_uri: DRIVE_REDIRECT_URI,
		response_type: 'code',
		scope: DRIVE_SCOPE,
		access_type: 'offline',
		prompt: 'consent',
		state
	});
	return `${DRIVE_ENDPOINTS.auth}?${params.toString()}`;
}

/**
 * Exchanges the callback's authorization code for tokens. Returns the refresh
 * token for the callback route to DISPLAY once; nothing here logs or persists
 * it. Google's error bodies carry {error, error_description} and never
 * tokens, so surfacing them is safe.
 */
export async function exchangeDriveCode(
	code: string
): Promise<{ refreshToken: string | null; scope: string | null; error: string | null }> {
	const res = await fetch(DRIVE_ENDPOINTS.token, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: clientId(),
			client_secret: clientSecret(),
			redirect_uri: DRIVE_REDIRECT_URI
		})
	});
	if (!res.ok) {
		const detail = (await res.text().catch(() => '')).slice(0, 300);
		return {
			refreshToken: null,
			scope: null,
			error: `Google token exchange failed (${res.status}): ${detail}`
		};
	}
	const body = (await res.json()) as { refresh_token?: string; scope?: string };
	return { refreshToken: body.refresh_token ?? null, scope: body.scope ?? null, error: null };
}

let cachedToken: { forRefreshToken: string; token: string; expiresAtMs: number } | null = null;

/**
 * Mints (or reuses) a short-lived access token from the stored refresh token.
 * Cached until ~1 min before expiry; `force` skips the cache after a Drive
 * call answered 401 (a cached token can outlive a revocation).
 */
async function accessToken(force = false): Promise<string> {
	const rt = refreshToken();
	if (!rt) {
		throw new Error(
			'The notebook Drive integration is not configured (no refresh token; an admin runs /admin/drive-connect once to mint one).'
		);
	}
	if (!force && cachedToken && cachedToken.forRefreshToken === rt && Date.now() < cachedToken.expiresAtMs) {
		return cachedToken.token;
	}

	const res = await fetch(DRIVE_ENDPOINTS.token, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: rt,
			client_id: clientId(),
			client_secret: clientSecret()
		})
	});
	if (!res.ok) {
		const detail = (await res.text().catch(() => '')).slice(0, 300);
		const revoked = detail.includes('invalid_grant')
			? ' The stored refresh token no longer works (revoked or expired); reconnect at /admin/drive-connect and update GOOGLE_DRIVE_REFRESH_TOKEN.'
			: '';
		throw new Error(`Google token refresh failed (${res.status}): ${detail}${revoked}`);
	}
	const body = (await res.json()) as { access_token?: string; expires_in?: number };
	if (!body.access_token) {
		throw new Error('Google token refresh returned no access token.');
	}
	cachedToken = {
		forRefreshToken: rt,
		token: body.access_token,
		expiresAtMs: Date.now() + (Math.max(60, body.expires_in ?? 3600) - 60) * 1000
	};
	return body.access_token;
}

/**
 * Uploads one photo into the notebook shared-drive folder and returns the
 * Drive file id. Throws with a readable message on any failure; the caller
 * decides how to surface it.
 */
export async function uploadNotebookPhoto(opts: {
	bytes: Uint8Array;
	mimeType: string;
	filename: string;
}): Promise<string> {
	if (!driveConfigured()) {
		throw new Error('The notebook Drive integration is not configured.');
	}

	const boundary = `nb-${randomUUID()}`;
	const metadata = JSON.stringify({ name: opts.filename, parents: [notebookFolderId()] });
	const head = new TextEncoder().encode(
		`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
			`--${boundary}\r\ncontent-type: ${opts.mimeType}\r\n\r\n`
	);
	const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
	const body = new Uint8Array(head.length + opts.bytes.length + tail.length);
	body.set(head, 0);
	body.set(opts.bytes, head.length);
	body.set(tail, head.length + opts.bytes.length);

	const attempt = (token: string) =>
		fetch(`${DRIVE_ENDPOINTS.upload}?uploadType=multipart&supportsAllDrives=true&fields=id`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': `multipart/related; boundary=${boundary}`
			},
			body
		});

	let res = await attempt(await accessToken());
	if (res.status === 401) {
		// The cached access token may have been revoked out from under us;
		// mint a fresh one and retry exactly once.
		res = await attempt(await accessToken(true));
	}
	if (!res.ok) {
		const detail = (await res.text().catch(() => '')).slice(0, 300);
		throw new Error(`Drive upload failed (${res.status}): ${detail}`);
	}
	const uploaded = (await res.json()) as { id?: string };
	if (!uploaded.id) {
		throw new Error('Drive upload returned no file id.');
	}
	return uploaded.id;
}

/**
 * Best-effort delete, used ONLY to clean up an orphaned upload when the
 * follow-up RPC insert fails. Swallows every error: cleanup must never mask
 * the original failure, and a stray file in the shared drive is harmless.
 */
export async function deleteNotebookFile(fileId: string): Promise<void> {
	try {
		if (!driveConfigured() || !fileId) return;
		const token = await accessToken();
		await fetch(`${DRIVE_ENDPOINTS.files}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
			method: 'DELETE',
			headers: { authorization: `Bearer ${token}` }
		});
	} catch {
		// Best-effort by design.
	}
}
