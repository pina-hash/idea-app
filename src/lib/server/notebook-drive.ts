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
 * One slug component of a Drive filename: lowercase, spaces to hyphens,
 * anything not alphanumeric-or-hyphen stripped, hyphen runs collapsed,
 * capped. Falls back so a component can never be empty (an empty segment
 * would read as a double separator in the name).
 */
export function driveNameSlug(raw: string | null | undefined, cap: number, fallback: string): string {
	const s = (raw ?? '')
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, cap)
		.replace(/-$/, '');
	return s || fallback;
}

/**
 * The human-readable Drive filename for a notebook photo:
 * {date}_{identifier}_{label}_{variant}_{short-id}.{ext}. The shared-drive
 * folder is browsed BY EYE by the admin managing it, so the name carries who,
 * what, and when; the database still only ever stores the Drive file ID, so
 * the name is presentation, never an identifier anything reads back.
 * short-id (first 8 of the entry uuid) keeps identical date/identifier/label
 * names from colliding. Date is the America/Los_Angeles calendar day, the
 * same day convention the notebook's on-time math uses (0069).
 *
 * The label component falls through: session label / custom label (the
 * caller resolves which and passes it as `label`) -> the browser's original
 * filename with its extension stripped (0071; the file often already has a
 * meaningful name) -> the literal 'entry' only when both slug to nothing.
 */
export function notebookDriveFilename(opts: {
	identifier: string | null | undefined;
	label: string | null | undefined;
	originalFilename?: string | null;
	variant: string;
	entryShortId: string;
	ext: string;
}): string {
	const date = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Los_Angeles',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
	const identifier = driveNameSlug(opts.identifier, 40, 'student');
	const stem = (opts.originalFilename ?? '').replace(/\.[^.]+$/, '');
	const label =
		driveNameSlug(opts.label, 40, '') || driveNameSlug(stem, 40, '') || 'entry';
	return `${date}_${identifier}_${label}_${opts.variant}_${opts.entryShortId}.${opts.ext}`;
}

/**
 * Best-effort rename, used by /api/notebook/upload AFTER notebook_create_entry
 * returns: that route must push the file to Drive before the entry exists (the
 * RPC takes the file id), so the entry's short-id can only land in the name by
 * renaming afterwards. Swallows every error like deleteNotebookFile does -- the
 * filename is presentation only, and a failed rename must never fail an upload
 * that actually succeeded.
 */
export async function renameNotebookFile(fileId: string, filename: string): Promise<void> {
	try {
		const attempt = (token: string) =>
			fetch(`${DRIVE_ENDPOINTS.files}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
				method: 'PATCH',
				headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ name: filename })
			});
		let res = await attempt(await accessToken());
		if (res.status === 401) {
			res = await attempt(await accessToken(true));
		}
	} catch {
		// Cosmetic; the provisional name is already readable.
	}
}

/**
 * Finds (or creates) a folder by name inside `parentId`, defaulting to the
 * notebook folder, and returns its id.
 *
 * WHY IT EXISTS: the classroom module keeps its attachments in their own
 * subfolder of the same shared-drive folder, so the admin browsing that folder
 * by eye is not looking at notebook photos and lesson handouts interleaved. It
 * is create-if-missing rather than another hardcoded id because the folder does
 * not exist yet on any deployment and minting one by hand per environment is a
 * setup step that will be forgotten.
 *
 * Cached per (parent, name) for the process: folder ids are stable, and a cold
 * serverless invocation paying one extra list call is cheaper than every upload
 * paying it. Both calls carry supportsAllDrives + includeItemsFromAllDrives,
 * without which a shared-drive-nested folder is invisible to the plain
 * endpoints (the module header's rule, which applies to LOOKUPS too -- a search
 * missing that flag silently returns nothing and this would create a duplicate
 * folder on every call).
 */
const folderCache = new Map<string, string>();

export async function ensureDriveSubfolder(name: string, parentId?: string): Promise<string> {
	if (!driveConfigured()) {
		throw new Error('The Drive integration is not configured.');
	}
	const parent = parentId || notebookFolderId();
	const cacheKey = `${parent}/${name}`;
	const cached = folderCache.get(cacheKey);
	if (cached) return cached;

	const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
	const query =
		`'${parent}' in parents and name = '${escaped}' ` +
		`and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
	const search = `${DRIVE_ENDPOINTS.files}?q=${encodeURIComponent(query)}` +
		'&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)&pageSize=1';

	const listAttempt = (token: string) =>
		fetch(search, { headers: { authorization: `Bearer ${token}` } });
	let res = await listAttempt(await accessToken());
	if (res.status === 401) res = await listAttempt(await accessToken(true));
	if (res.ok) {
		const body = (await res.json()) as { files?: { id?: string }[] };
		const found = body.files?.[0]?.id;
		if (found) {
			folderCache.set(cacheKey, found);
			return found;
		}
	}

	const createAttempt = (token: string) =>
		fetch(`${DRIVE_ENDPOINTS.files}?supportsAllDrives=true&fields=id`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				name,
				mimeType: 'application/vnd.google-apps.folder',
				parents: [parent]
			})
		});
	let made = await createAttempt(await accessToken());
	if (made.status === 401) made = await createAttempt(await accessToken(true));
	if (!made.ok) {
		const detail = (await made.text().catch(() => '')).slice(0, 300);
		throw new Error(`Drive folder create failed (${made.status}): ${detail}`);
	}
	const created = (await made.json()) as { id?: string };
	if (!created.id) throw new Error('Drive folder create returned no id.');
	folderCache.set(cacheKey, created.id);
	return created.id;
}

/**
 * Uploads one file into a shared-drive folder (the notebook folder by default)
 * and returns the Drive file id. The generic form behind uploadNotebookPhoto:
 * same auth, same token cache, same one-shot 401 re-mint, same
 * supportsAllDrives -- the classroom attachment route reuses it rather than
 * standing up a second Drive client.
 */
export async function uploadDriveFile(opts: {
	bytes: Uint8Array;
	mimeType: string;
	filename: string;
	parentId?: string;
}): Promise<string> {
	if (!driveConfigured()) {
		throw new Error('The notebook Drive integration is not configured.');
	}

	const boundary = `nb-${randomUUID()}`;
	const metadata = JSON.stringify({
		name: opts.filename,
		parents: [opts.parentId || notebookFolderId()]
	});
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

/** The notebook's own upload: uploadDriveFile into the notebook folder. */
export async function uploadNotebookPhoto(opts: {
	bytes: Uint8Array;
	mimeType: string;
	filename: string;
}): Promise<string> {
	return uploadDriveFile(opts);
}

/**
 * The image content types this module will hand back. Uploads already
 * enforce exactly this set (readPhotoForm in notebook-upload.ts), so a
 * notebook photo is always one of them; anything else coming back from
 * Drive is a sign the file id does not point at a photo we wrote.
 *
 * The allowlist matters because the proxy route serves these bytes FROM THE
 * APP'S OWN ORIGIN: a response typed text/html there would run as
 * same-origin script. Unknown types are served as application/octet-stream
 * (inert, downloads rather than renders) instead of being echoed back.
 */
const SERVABLE_IMAGE_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif'
]);

export interface NotebookFileDownload {
	/** The raw bytes, streamed straight through without buffering. */
	body: ReadableStream<Uint8Array>;
	/** Always safe to put in a Content-Type header (see the allowlist above). */
	contentType: string;
	/** Drive's own Content-Length when it sent one, else null. */
	contentLength: string | null;
}

/**
 * Reads one file's BYTES out of the shared drive, on the school account's
 * behalf, using the same cached access token upload/rename/delete use.
 *
 * This exists because Postgres stores only the Drive file id and the folder
 * lives in a restricted shared drive: asking the browser to fetch from
 * drive.google.com only ever worked for a viewer who personally had access
 * to that folder. The proxy route (/api/notebook/photo/[photo_id]) is what
 * turns "the server can read this file" into "this signed-in student can
 * see their own photo", and it does the AUTHORIZATION itself -- this
 * function deliberately knows nothing about who is asking and must never be
 * called without that check having passed first.
 *
 * Streams rather than buffers: photos are capped at 4 MB but there is no
 * reason to hold one in serverless memory when the response can pass
 * straight through.
 */
export async function downloadNotebookFile(fileId: string): Promise<NotebookFileDownload> {
	return downloadDriveFile(fileId, SERVABLE_IMAGE_TYPES);
}

/**
 * The generic download behind downloadNotebookFile. `servable` is the caller's
 * OWN allowlist of content types it is willing to echo back, because what is
 * safe to serve depends on the surface: the notebook only ever holds photos,
 * while a classroom attachment is legitimately a PDF. Anything outside the
 * caller's list is typed application/octet-stream (inert) rather than trusted
 * from Drive -- these bytes leave from the app's own origin, where a response
 * typed text/html would run as same-origin script.
 */
export async function downloadDriveFile(
	fileId: string,
	servable: ReadonlySet<string>
): Promise<NotebookFileDownload> {
	if (!driveConfigured()) {
		throw new Error('The notebook Drive integration is not configured.');
	}
	if (!fileId) {
		throw new Error('A Drive file id is required.');
	}

	const attempt = (token: string) =>
		fetch(
			`${DRIVE_ENDPOINTS.files}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
			{ headers: { authorization: `Bearer ${token}` } }
		);

	// Same one-shot 401 retry the write paths use: a cached access token can
	// outlive a revocation. The body is untouched on that branch, so nothing
	// is consumed before the retry.
	let res = await attempt(await accessToken());
	if (res.status === 401) {
		res = await attempt(await accessToken(true));
	}
	if (!res.ok) {
		const detail = (await res.text().catch(() => '')).slice(0, 300);
		throw new Error(`Drive download failed (${res.status}): ${detail}`);
	}
	if (!res.body) {
		throw new Error('Drive download returned no body.');
	}

	const raw = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	return {
		body: res.body,
		contentType: servable.has(raw) ? raw : 'application/octet-stream',
		contentLength: res.headers.get('content-length')
	};
}

/**
 * Best-effort delete, used ONLY to clean up an orphaned upload when the
 * follow-up RPC insert fails. Swallows every error: cleanup must never mask
 * the original failure, and a stray file in the shared drive is harmless.
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
	return deleteNotebookFile(fileId);
}

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
