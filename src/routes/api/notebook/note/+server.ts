import { json } from '@sveltejs/kit';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Creates a notebook entry with NO photo -- the free-form "just write a note"
 * tier 0075 opened up.
 *
 * WHY ITS OWN ROUTE rather than a branch in /api/notebook/upload: a note
 * shares exactly one step with a photo upload, the notebook_create_entry call.
 * Everything else that route does -- multipart parsing, the size/mime gate,
 * the Drive-configured gate, deriving a human-readable Drive filename,
 * uploading, renaming to the entry's short id, deleting the orphan when the
 * RPC refuses -- is about a FILE, and folding a note into it would grow an
 * "if there is a photo" branch around every one of them. Separate, this
 * handler is the RPC call and nothing else, and it keeps working on a
 * deployment where the Drive integration is not configured at all, which is
 * correct: a note needs no Drive.
 *
 * Authentication is the same as every other notebook write, with no
 * exception: the caller's real session is required (401 without one), and the
 * RPC runs under their OWN cookie session (locals.supabase), so the RPC's
 * internal auth.uid() check is the authorization.
 *
 * JSON body:
 *   custom_label  the note text/label (required in practice -- the RPC
 *                 refuses a free entry with neither photo nor label)
 *   section_id    uuid of a notebook_sections row (optional)
 *   session_id    uuid of a notebook_sessions row (optional, and passed
 *                 THROUGH rather than blocked here: a session-linked entry
 *                 still requires a photo, and the RPC is the one place that
 *                 rule lives -- refusing it here would be a second copy of it)
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'Expected a JSON body.' }, { status: 400 });
	}

	const text = (key: string): string | null => {
		const v = body[key];
		const s = typeof v === 'string' ? v.trim() : '';
		return s === '' ? null : s;
	};

	const customLabel = text('custom_label');
	const sessionId = text('session_id');
	const sectionId = text('section_id');
	if (sessionId && !UUID_RE.test(sessionId)) {
		return json({ error: 'session_id must be a uuid.' }, { status: 400 });
	}
	if (sectionId && !UUID_RE.test(sectionId)) {
		return json({ error: 'section_id must be a uuid.' }, { status: 400 });
	}
	if (customLabel && customLabel.length > 200) {
		return json({ error: 'Labels are capped at 200 characters.' }, { status: 400 });
	}

	const { data, error } = await supabase.rpc('notebook_create_entry', {
		p_student_id: claims.sub,
		p_drive_file_id: null,
		p_session_id: sessionId,
		p_section_id: sectionId,
		p_custom_label: customLabel,
		p_original_filename: null
	});
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ ok: true, entry: data });
};
