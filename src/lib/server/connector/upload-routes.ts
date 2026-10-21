/**
 * WHAT THE ADMIN FILE ROUTES SHARE (ledger 0422): reading a chat's upload for
 * the signed-in admin, and naming a record the way he says it. The routes
 * themselves (`/api/admin/files/*`) are the site's own actions and the
 * connector reaches them as endpoint entries, asked first and audited.
 */
import { randomBytes } from 'node:crypto';
import { SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES } from '$lib/upload-limits';
import { connectorDeps } from './deps';
import { sha256Hex } from './crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readChatUpload(userId: string, uploadId: string): Promise<{ filename: string; bytes: Uint8Array } | null> {
	if (!UUID.test(uploadId)) return null;
	const deps = await connectorDeps();
	const got = await deps.backend.readUpload(userId, uploadId);
	return got ? { filename: got.slot.filename, bytes: got.bytes } : null;
}

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** One record's id by its name or id, as him; a message when there is none or more than one. */
export async function idByName(supabase: Rpc, kind: string, said: string): Promise<{ ok: true; id: string; name: string } | { ok: false; message: string }> {
	const raw = said.trim();
	if (!raw) return { ok: false, message: 'Name it.' };
	if (UUID.test(raw)) return { ok: true, id: raw.toLowerCase(), name: raw };
	const { data, error } = await supabase.rpc('connector_lookup', { p_kind: kind, p_said: raw });
	if (error) return { ok: false, message: error.message };
	const matches = ((data as { matches?: Array<{ id: string; name: string }> } | null)?.matches ?? []);
	const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
	const exact = matches.filter((m) => norm(m.name) === norm(raw));
	const pick = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
	if (pick) return { ok: true, id: pick.id, name: pick.name };
	if (!matches.length) return { ok: false, message: `Nothing is called "${raw}".` };
	return { ok: false, message: `More than one matches "${raw}": ${matches.slice(0, 6).map((m) => m.name).join('; ')}. Say which.` };
}

/** The project's global storage upload limit (0185), which the bucket states too. */
const UPLOAD_MAX_BYTES = SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES;
const UPLOAD_WINDOW_MS = 30 * 60_000;

/**
 * A ONE-TIME UPLOAD FOR THE SIGNED-IN ADMIN: a slot, and a signed address the
 * bytes go to straight into the private bucket, so a file far bigger than a
 * request body reaches the site. Nothing on the site changes until a tool
 * names the upload.
 */
export async function openChatUpload(userId: string, filename: string, type: string | null, megabytes: number | null) {
	const deps = await connectorDeps();
	const maxBytes = Math.min(UPLOAD_MAX_BYTES, Math.max(1, Math.ceil((megabytes ?? 50) * 1_000_000)));
	const clean = filename.replace(/[\\/]+/g, '_').trim().slice(0, 200) || 'file';
	const slot = await deps.backend.createUpload({
		userId,
		tokenHash: sha256Hex(randomBytes(32).toString('base64url')),
		filename: clean,
		contentType: type,
		maxBytes,
		expiresAt: deps.now() + UPLOAD_WINDOW_MS
	});
	return {
		ok: true,
		upload: slot.id,
		filename: clean,
		max_bytes: maxBytes,
		expires_in_minutes: UPLOAD_WINDOW_MS / 60_000,
		put_url: slot.uploadUrl,
		how: [
			`With a shell: curl -X PUT -H "content-type: ${type ?? 'application/octet-stream'}" --data-binary @${JSON.stringify(clean)} "${slot.uploadUrl}"`,
			'With no shell: send it in numbered pieces of up to 200,000 characters with upload part (text as text, anything else as base64).'
		],
		then: 'Name this upload in the action that uses it: replace html assignment, attach file, publish foundry app or set foundry cover.'
	};
}

/** One numbered piece of an upload, for a chat that cannot PUT a file. */
export async function storeChatUploadPart(userId: string, uploadId: string, part: number, text: string | null, base64: string | null) {
	if (!UUID.test(uploadId) || !Number.isInteger(part) || part < 1 || part > 9999) return { ok: false, message: 'Name the upload and the piece number, from 1.' };
	if ((text === null) === (base64 === null)) return { ok: false, message: 'Send the piece as text or as base64, one of the two.' };
	const bytes = text !== null ? new TextEncoder().encode(text) : new Uint8Array(Buffer.from(base64 as string, 'base64'));
	if (bytes.byteLength === 0) return { ok: false, message: 'That piece was empty.' };
	const deps = await connectorDeps();
	const r = await deps.backend.storeUploadPart(userId, uploadId, part, bytes);
	return r.ok ? { ok: true, upload: uploadId, part, received_bytes: r.received } : { ok: false, message: r.message ?? 'That piece was not kept.' };
}
