import { json } from '@sveltejs/kit';
import { normalizeNoteDoc } from '$lib/server/notebook-notes';
import { UUID_RE } from '$lib/server/notebook-upload';
import { rpcErrorStatus } from '$lib/pg-errors';
import type { RequestHandler } from './$types';

/**
 * Revises a note: notebook_edit_note writes a NEW revision superseding the
 * current one, so nothing a student wrote is ever overwritten or lost.
 *
 * TWO RULES LIVE IN THE RPC, NOT HERE, and that is the point of how thin this
 * handler is: the note must belong to the caller, and a note on a
 * SESSION-LINKED entry cannot be edited at all. The UI hides the edit control
 * on those entries, but hiding a control is not a rule -- this route forwards
 * the attempt and lets the database refuse it, which is what makes the
 * refusal true for any caller, including one talking to PostgREST directly.
 *
 * JSON body:
 *   note_id  the LOGICAL note (notebook_entry_notes.note_id), not a
 *            particular revision (required)
 *   content  the editor's document (required; normalized before storage)
 *   autosave true REPLACES the head revision in place instead of appending a
 *            new one (0129), when the head is itself a replaceable autosave
 *            revision by this caller on a draft. The database decides; this
 *            only forwards the intent.
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

	const noteId = typeof body.note_id === 'string' ? body.note_id.trim() : '';
	if (!UUID_RE.test(noteId)) {
		return json({ error: 'note_id must be a uuid.' }, { status: 400 });
	}

	const note = normalizeNoteDoc(body.content);
	if (!note.ok) {
		return json({ error: note.error }, { status: 400 });
	}

	/**
	 * p_autosave (0129) is what turns an APPEND into a REPLACEMENT of the head,
	 * and it is named only when the caller asked for it -- both because a
	 * project still on 0128 has no such parameter (PostgREST would fail to
	 * resolve the function and break every note edit) and because the entry
	 * card's own note editor must never send it: that surface mints a revision
	 * an instructor may already have read.
	 */
	const args: Record<string, unknown> = { p_note_id: noteId, p_content: note.doc };
	if (body.autosave === true) args.p_autosave = true;

	const { data, error } = await supabase.rpc('notebook_edit_note', args);
	if (error) {
		/**
		 * A REFUSAL AND A TRANSIENT ARE REPORTED DIFFERENTLY, and until this line
		 * they were not. Every RPC error left here as a 400, which the composer's
		 * retry curve reads as "the server considered this payload and said no"
		 * -- so a deadlock or a `too_many_connections`, neither of which is a
		 * decision about the payload at all, was dropped after one attempt with a
		 * student's writing in it. `rpcErrorStatus` is the one partition
		 * ($lib/pg-errors); a `raise` from the RPC is still a 400 and still
		 * reaches the reader as its own sentence.
		 */
		return json({ error: error.message }, { status: rpcErrorStatus(error.code) });
	}

	return json({ ok: true, note: data });
};
