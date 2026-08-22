import { json } from '@sveltejs/kit';
import { normalizeItemDoc } from '$lib/server/classroom-doc';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Writes a notebook check-in's GUIDANCE PROMPT (0123).
 *
 * WHY THIS ROUTE EXISTS, when the rule is that a single RPC call with two
 * strings is made straight from the browser. The translation from the editor's
 * ProseMirror document into the closed stored shape is
 * `$lib/server/classroom-doc`'s whitelist normalizer -- it BUILDS its result
 * from the node types it names, so an unknown type cannot survive into it --
 * and `$lib/server` is a real boundary rather than a convention precisely
 * because SvelteKit refuses to bundle it into a client. There is no client-side
 * spelling of that translation and there must not be one, so the work needs the
 * server and this is the route that does it.
 *
 * IT ADDS NO AUTHORITY. The RPC is called through `locals.supabase`, which is
 * the CALLER'S own session, so `_notebook_manages_session` inside
 * `notebook_set_session_guidance` decides exactly as it would for a caller
 * hitting PostgREST directly -- and `_classroom_doc_ok` refuses the document a
 * second time in the database whatever this handler did with it. Nothing here
 * is a permission check, and nothing here is the gate.
 *
 * NOT IN `authedPrefixes`: it answers its own 401, like every other route under
 * `/api/notebook/*`.
 *
 * JSON body:
 *   session_id  the check-in (required)
 *   guidance    the editor's document, or null to CLEAR the prompt. Null, an
 *               empty document and a document of empty blocks are one state
 *               here exactly as they are in 0123: the normalizer answers `[]`
 *               for all three and the RPC stores SQL NULL.
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

	const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
	if (!UUID_RE.test(sessionId)) {
		return json({ error: 'session_id must be a uuid.' }, { status: 400 });
	}

	const shaped = normalizeItemDoc(body.guidance ?? null);
	if (!shaped.ok) {
		return json({ error: shaped.error }, { status: 400 });
	}

	// An empty document is handed over as-is: 0123 folds `[]` to SQL NULL
	// itself, so there is no second place that has to know what "cleared"
	// means.
	const { data, error } = await supabase.rpc('notebook_set_session_guidance', {
		p_session_id: sessionId,
		p_guidance_doc: shaped.doc
	});
	if (error) {
		// The RPC's own messages are written to be shown to the person who hit
		// them ("Only the teacher of record...", "That guidance could not be
		// read."), so they are surfaced rather than replaced.
		return json({ error: error.message }, { status: 400 });
	}

	const result = (data ?? {}) as { cleared?: boolean; length?: number };
	return json({ ok: true, cleared: !!result.cleared, length: result.length ?? 0 });
};
