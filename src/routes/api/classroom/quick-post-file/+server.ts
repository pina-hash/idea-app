import { json } from '@sveltejs/kit';
import { classifyRpcError } from '$lib/classroom/upload-errors';
import { quickPostRefusalWords } from '$lib/classroom/quick-posts';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * RECORDS ONE ALREADY-UPLOADED FILE AGAINST ONE CLASS NOTICE (0233, ledger
 * 0368). The bytes went browser to the private `quick-post-files` bucket
 * against a URL ./sign minted; this writes the ROW.
 *
 * AUTHORIZATION IS THE RPC'S. `classroom_quick_post_add_file` runs on the
 * caller's own session, re-checks that they wrote the notice, that it is still
 * up and under ten files, and that the key's own prefix IS this notice, so a
 * key minted for one notice cannot be hung off another. The same key twice is
 * the row it already made (a retry after a dropped connection).
 *
 * A REFUSED RECORD DOES NOT SWEEP THE OBJECT, and that differs from the
 * attachment route on purpose: this bucket has NO delete policy (archive,
 * never delete), so a sweep under the caller's session would fail silently.
 * An orphaned private object nothing names and nothing serves is the
 * accepted failure (CLAUDE.md, "rows first, then objects").
 *
 * Answers `{ ok: true, file: { id, filename, size_bytes } }`, which is what
 * the shared uploader hands its panel as the landed row.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ ok: false, error: 'You must be signed in.' }, { status: 401 });
	}

	let body: { item_id?: unknown; storage_key?: unknown; filename?: unknown; size_bytes?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
	}

	const postId = String(body.item_id ?? '').trim().toLowerCase();
	if (!UUID_RE.test(postId)) {
		return json({ ok: false, error: 'item_id must be a uuid.' }, { status: 400 });
	}
	const storageKey = String(body.storage_key ?? '').trim();
	if (!storageKey.startsWith(`${postId}/`) || storageKey.length > 200) {
		return json({ ok: false, error: 'storage_key must name this notice.' }, { status: 400 });
	}
	const filename = String(body.filename ?? '').trim().slice(0, 255) || 'file';
	const rawSize = Number(body.size_bytes ?? 0);
	const sizeBytes = Number.isFinite(rawSize) && rawSize > 0 ? Math.round(rawSize) : null;

	const { data, error } = await supabase.rpc('classroom_quick_post_add_file', {
		p_post_id: postId,
		p_storage_key: storageKey,
		p_filename: filename,
		p_size_bytes: sizeBytes
	});

	if (error) {
		const refusal = classifyRpcError({
			code: (error as { code?: string }).code,
			message: error.message,
			role: 'quick-post'
		});
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 200 });
	}

	const r = (data ?? {}) as { ok?: boolean; reason?: string; limit?: number; file?: { id?: string; filename?: string; size_bytes?: number | null } };
	if (r.ok !== true || !r.file?.id) {
		const reason = typeof r.reason === 'string' ? r.reason : 'error';
		return json(
			{ ok: false, reason, gate: 'denied', retryable: false, error: quickPostRefusalWords(reason, r.limit ?? null) },
			{ status: 200 }
		);
	}
	return json({
		ok: true,
		storage_key: storageKey,
		file: { id: r.file.id, filename: r.file.filename ?? filename, size_bytes: r.file.size_bytes ?? null }
	});
};
