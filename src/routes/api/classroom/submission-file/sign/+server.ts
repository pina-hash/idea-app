import { json } from '@sveltejs/kit';
import {
	MAX_STORAGE_BYTES,
	SUBMISSION_FILES_BUCKET,
	storageObjectKey
} from '$lib/server/classroom-attachments';
import { classifyRpcError, classifyUploadError, tooLarge } from '$lib/classroom/upload-errors';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * THE STUDENT HALF OF /api/classroom/attachment/sign, and the same code shape
 * on purpose -- one extra step in front of it.
 *
 * A hand-in's key is prefixed by the SUBMISSION id rather than the item id,
 * because that is what 0133's policy reads to decide "is this your own work".
 * A submission row is created lazily by the first thing a student does on an
 * assignment, so it may not exist yet when a file is picked --
 * `classroom_open_submission` is the step that makes sure it does, and it is
 * where a LOCKED (already turned in) submission is refused, before a signed
 * URL exists at all.
 *
 * AUTHORIZATION IS THE RPC'S AND THEN STORAGE'S, in that order, and neither is
 * restated here. `classroom_open_submission` resolves the caller through
 * `_classroom_engine_student` -- published assignment, actively enrolled, no
 * email parameter, so acting as somebody else is not expressible -- and then
 * `createSignedUploadUrl` runs on the caller's own session against a policy
 * that admits only the owning student. A teacher cannot mint one of these for
 * a student's submission: reviewing is not authoring.
 *
 * Body (JSON):
 *   item_id     uuid of the assignment (required)
 *   filename    the browser's name for the file (required; extension only)
 *   size_bytes  optional, for the early size refusal
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ ok: false, error: 'You must be signed in.' }, { status: 401 });
	}

	let body: { item_id?: unknown; filename?: unknown; size_bytes?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
	}

	const itemId = String(body.item_id ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ ok: false, error: 'item_id must be a uuid.' }, { status: 400 });
	}
	const filename = String(body.filename ?? '').trim();
	if (!filename) {
		return json({ ok: false, error: 'filename is required.' }, { status: 400 });
	}

	const size = Number(body.size_bytes ?? 0);
	if (Number.isFinite(size) && size > MAX_STORAGE_BYTES) {
		const refusal = tooLarge(size, MAX_STORAGE_BYTES);
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 413 });
	}

	const { data: opened, error: openError } = await supabase.rpc('classroom_open_submission', {
		p_item_id: itemId
	});
	if (openError) {
		// A transient conflict is not a refusal. See classifyRpcError.
		const refusal = classifyRpcError({
			code: (openError as { code?: string }).code,
			message: openError.message,
			role: 'submission'
		});
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 200 });
	}
	const submission = opened as { ok?: boolean; reason?: string; submission_id?: string } | null;
	if (submission?.ok === false) {
		return json({
			ok: false,
			gate: 'denied',
			retryable: false,
			reason: submission.reason ?? 'refused',
			error:
				submission.reason === 'locked'
					? 'This is turned in, so files are locked. Unsubmit it to keep working.'
					: 'That file was not accepted.'
		});
	}
	const submissionId = submission?.submission_id ?? '';
	if (!UUID_RE.test(submissionId)) {
		return json(
			{ ok: false, gate: 'server', retryable: true, error: 'No submission was opened for this assignment.' },
			{ status: 500 }
		);
	}

	const key = storageObjectKey(submissionId, filename);
	const { data, error } = await supabase.storage
		.from(SUBMISSION_FILES_BUCKET)
		.createSignedUploadUrl(key);

	if (error || !data) {
		const status = Number((error as { statusCode?: string | number } | null)?.statusCode ?? 403);
		const refusal = classifyUploadError({
			status: Number.isFinite(status) ? Number(status) : 403,
			detail: error?.message,
			role: 'submission',
			sizeBytes: Number.isFinite(size) && size > 0 ? size : undefined,
			maxBytes: MAX_STORAGE_BYTES
		});
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 200 });
	}

	return json({
		ok: true,
		bucket: SUBMISSION_FILES_BUCKET,
		key: data.path,
		token: data.token,
		signed_url: data.signedUrl,
		submission_id: submissionId
	});
};
