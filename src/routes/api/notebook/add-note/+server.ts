import { json } from '@sveltejs/kit';
import { normalizeNoteDoc } from '$lib/server/notebook-notes';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Adds another written note to an existing entry -- the note counterpart of
 * /api/notebook/add-photo, and named to match it.
 *
 * This is what makes an entry something a student keeps adding to over time
 * rather than something they file once: notes written days apart all belong to
 * the same entry, exactly as extra photos already do.
 *
 * Entry ownership is the RPC's own check (notebook_add_note, owner-only under
 * the caller's session), never this handler's; all this route does is
 * normalize the content and forward it.
 *
 * JSON body:
 *   entry_id  uuid of the entry to extend (required)
 *   content   the editor's document (required; normalized before storage)
 *   autosave  true marks the revision REPLACEABLE (0129)
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

	const entryId = typeof body.entry_id === 'string' ? body.entry_id.trim() : '';
	if (!UUID_RE.test(entryId)) {
		return json({ error: 'entry_id must be a uuid.' }, { status: 400 });
	}

	const note = normalizeNoteDoc(body.content);
	if (!note.ok) {
		return json({ error: note.error }, { status: 400 });
	}

	/**
	 * p_autosave is named ONLY when the caller asked for it (0129), which is the
	 * deploy-ordering rule every other optional parameter in these routes
	 * follows: on a project still on 0128 the function has no such parameter and
	 * naming it would leave PostgREST unable to resolve the call at all.
	 */
	const args: Record<string, unknown> = { p_entry_id: entryId, p_content: note.doc };
	if (body.autosave === true) args.p_autosave = true;

	const { data, error } = await supabase.rpc('notebook_add_note', args);
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({ ok: true, note: data });
};
