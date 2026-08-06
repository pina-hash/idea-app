/**
 * Server-side Google Drive uploads for the digital notebook ($lib/server, so
 * SvelteKit refuses to bundle any of this client-side -- the coin-ledger /
 * push convention). Photo BYTES live in a Google Shared Drive; Postgres
 * stores only the returned Drive file id (0069).
 *
 * Auth is a Google SERVICE ACCOUNT: the JSON key from
 * GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY ($env/dynamic/private, server-only, read
 * at runtime so a missing value never breaks the build -- the routes answer
 * 503 "not configured" instead). Uploads land in the shared drive folder
 * GOOGLE_DRIVE_NOTEBOOK_FOLDER_ID; the service account's email must be a
 * member of that shared drive (Content manager) or every upload 404s.
 *
 * No googleapis dependency: the OAuth2 JWT-bearer exchange is ~40 lines of
 * node:crypto (RS256), and the upload is one multipart/related POST. The
 * token is cached until shortly before expiry. supportsAllDrives=true rides
 * every call because the target is a shared drive, which the plain endpoints
 * pretend not to see.
 *
 * The scope is the full https://www.googleapis.com/auth/drive rather than
 * drive.file: the service account is dedicated to this feature and must
 * create files inside a shared-drive folder it did not itself create, which
 * drive.file's "files you opened or created" grant does not reliably cover.
 */

import { createSign, randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';

interface ServiceAccountKey {
	client_email: string;
	private_key: string;
	token_uri?: string;
}

/**
 * Google API hosts. Exported as a mutable object ONLY so the offline
 * verification harness can point them at a local mock (the real Google side
 * needs the real key); production code must never write to this.
 */
export const DRIVE_ENDPOINTS = {
	upload: 'https://www.googleapis.com/upload/drive/v3/files',
	files: 'https://www.googleapis.com/drive/v3/files'
};

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

function parseKey(): ServiceAccountKey | null {
	const raw = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY;
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
		if (!parsed.client_email || !parsed.private_key) return null;
		return {
			client_email: parsed.client_email,
			// A key pasted into an env editor sometimes arrives with literal
			// backslash-n sequences; normalize them to real newlines.
			private_key: parsed.private_key.replace(/\\n/g, '\n'),
			token_uri: parsed.token_uri
		};
	} catch {
		return null;
	}
}

export function driveConfigured(): boolean {
	return !!(parseKey() && env.GOOGLE_DRIVE_NOTEBOOK_FOLDER_ID);
}

function b64url(input: string | Uint8Array): string {
	return Buffer.from(input).toString('base64url');
}

let cachedToken: { forEmail: string; token: string; expiresAtMs: number } | null = null;

/** Exchange a signed JWT for an access token (cached until ~1 min before expiry). */
async function accessToken(key: ServiceAccountKey): Promise<string> {
	if (cachedToken && cachedToken.forEmail === key.client_email && Date.now() < cachedToken.expiresAtMs) {
		return cachedToken.token;
	}

	const tokenUri = key.token_uri || DEFAULT_TOKEN_URI;
	const now = Math.floor(Date.now() / 1000);
	const unsigned =
		b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
		'.' +
		b64url(
			JSON.stringify({
				iss: key.client_email,
				scope: DRIVE_SCOPE,
				aud: tokenUri,
				iat: now,
				exp: now + 3600
			})
		);
	const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
	const assertion = `${unsigned}.${b64url(signature)}`;

	const res = await fetch(tokenUri, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion
		})
	});
	if (!res.ok) {
		const detail = (await res.text().catch(() => '')).slice(0, 300);
		throw new Error(`Google token exchange failed (${res.status}): ${detail}`);
	}
	const body = (await res.json()) as { access_token?: string; expires_in?: number };
	if (!body.access_token) {
		throw new Error('Google token exchange returned no access token.');
	}
	cachedToken = {
		forEmail: key.client_email,
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
	const key = parseKey();
	const folderId = env.GOOGLE_DRIVE_NOTEBOOK_FOLDER_ID;
	if (!key || !folderId) {
		throw new Error('The notebook Drive integration is not configured.');
	}

	const token = await accessToken(key);
	const boundary = `nb-${randomUUID()}`;
	const metadata = JSON.stringify({ name: opts.filename, parents: [folderId] });
	const head = new TextEncoder().encode(
		`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
			`--${boundary}\r\ncontent-type: ${opts.mimeType}\r\n\r\n`
	);
	const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
	const body = new Uint8Array(head.length + opts.bytes.length + tail.length);
	body.set(head, 0);
	body.set(opts.bytes, head.length);
	body.set(tail, head.length + opts.bytes.length);

	const res = await fetch(
		`${DRIVE_ENDPOINTS.upload}?uploadType=multipart&supportsAllDrives=true&fields=id`,
		{
			method: 'POST',
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': `multipart/related; boundary=${boundary}`
			},
			body
		}
	);
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
		const key = parseKey();
		if (!key || !fileId) return;
		const token = await accessToken(key);
		await fetch(`${DRIVE_ENDPOINTS.files}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
			method: 'DELETE',
			headers: { authorization: `Bearer ${token}` }
		});
	} catch {
		// Best-effort by design.
	}
}
