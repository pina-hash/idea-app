import { json } from '@sveltejs/kit';
import { normalizeNoteDoc } from '$lib/server/notebook-notes';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Creates a notebook entry whose content is a WRITTEN NOTE -- no photo, an
 * optional short title, and since 0114 an optional check-in it answers.
 *
 * WHY ITS OWN ROUTE rather than a branch in /api/notebook/upload: a note
 * shares exactly one step with a photo upload, the entry insert. Everything
 * else that route does -- multipart parsing, the size/mime gate, the
 * Drive-configured gate, deriving a human-readable Drive filename, uploading,
 * renaming to the entry's short id, deleting the orphan when the RPC refuses
 * -- is about a FILE, and folding a note into it would grow an "if there is a
 * photo" branch around every one of them. Separate, this handler is
 * normalization plus one RPC call, and it keeps working on a deployment where
 * the Drive integration is not configured at all, which is correct: a note
 * needs no Drive.
 *
 * SINCE 0078 the note's TEXT is a notebook_entry_notes row, not
 * `custom_label`. That column goes back to being a short title and nothing
 * else: it is optional here, capped by its own 200-character CHECK, and a
 * note with no title is the ordinary case.
 *
 * `session_id` IS BACK IN THIS ROUTE'S CONTRACT, and it reverses a decision
 * this comment used to defend. The old reasoning was that a check-in exists
 * because an instructor asked for a page, so a note could not be one -- which
 * made a photo the only way to answer a check-in at all, and that is the bug
 * reported on the first day of classes. A written entry with no photograph is
 * legitimate work on every tier. 0114 gives notebook_create_note_entry a
 * session parameter and resolves the section through the same
 * _notebook_resolve_session_section notebook_create_entry uses, so a check-in
 * note lands on exactly the (session, section) posting pair the composite FK
 * accepts. Adding a note to an entry that already exists is still
 * /api/notebook/add-note; this is for the entry whose whole content is the
 * note.
 *
 * Authentication is the same as every other notebook write, with no exception:
 * the caller's real session is required (401 without one), and the RPC runs
 * under their OWN cookie session (locals.supabase), so the RPC's internal
 * auth.uid() check is the authorization.
 *
 * JSON body:
 *   content       the editor's document (required; normalized before storage)
 *   custom_label  a short title for the entry (optional, <= 200 chars)
 *   session_id    uuid of a notebook_sessions check-in (optional)
 *   section_id    which class the entry is for (optional; with a session it
 *                 must be one that check-in is posted to)
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
	const folderId = text('folder_id');
	if (sessionId && !UUID_RE.test(sessionId)) {
		return json({ error: 'session_id must be a uuid.' }, { status: 400 });
	}
	if (sectionId && !UUID_RE.test(sectionId)) {
		return json({ error: 'section_id must be a uuid.' }, { status: 400 });
	}
	if (folderId && !UUID_RE.test(folderId)) {
		return json({ error: 'folder_id must be a uuid.' }, { status: 400 });
	}
	if (customLabel && customLabel.length > 200) {
		return json({ error: 'Titles are capped at 200 characters.' }, { status: 400 });
	}

	// THE SANITIZER. Whatever the editor sent is translated into the closed
	// note shape here, on the server, before anything is stored.
	const note = normalizeNoteDoc(body.content);
	if (!note.ok) {
		return json({ error: note.error }, { status: 400 });
	}

	/**
	 * p_folder_id is added ONLY when a folder was actually asked for, and that
	 * is a deploy-ordering rule rather than a tidiness one. Migrations here are
	 * applied by hand, so a project sitting on 0078 with 0088 not yet run is a
	 * real state -- and there notebook_create_note_entry still has its old
	 * three-argument signature, so naming a fourth parameter unconditionally
	 * would make PostgREST fail to resolve the function at all and break note
	 * saving outright. Omitted, the call matches either version.
	 *
	 * A folder can only be requested once the UI has folders to offer, which
	 * means 0088 is applied; so the branch that needs the new signature is
	 * exactly the branch that has it.
	 *
	 * The value is passed THROUGH, never checked here: the RPC refuses a folder
	 * that is not the caller's own, and 0088's composite FK makes filing into
	 * someone else's unrepresentable regardless.
	 */
	const args: Record<string, unknown> = {
		p_content: note.doc,
		p_custom_label: customLabel,
		p_section_id: sectionId
	};
	if (folderId) args.p_folder_id = folderId;
	/**
	 * p_session_id follows p_folder_id's rule, for p_folder_id's reason: on a
	 * project still on 0113, notebook_create_note_entry has its four-argument
	 * signature, and naming a fifth unconditionally would leave PostgREST unable
	 * to resolve the function and break EVERY note -- including the free-form
	 * ones that have nothing to do with a check-in. Named only when a check-in
	 * was actually picked, the call matches either version, and the one shape
	 * that needs 0114 is the only one that asks for it.
	 */
	if (sessionId) args.p_session_id = sessionId;

	const { data, error } = await supabase.rpc('notebook_create_note_entry', args);
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ ok: true, entry: data });
};
