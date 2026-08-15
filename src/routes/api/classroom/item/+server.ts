import { json } from '@sveltejs/kit';
import { itemBodyColumns } from '$lib/server/classroom-doc';
import type { RequestHandler } from './$types';

/**
 * Creates or updates a classroom item, with its body SANITIZED SERVER-SIDE on
 * the way through.
 *
 * WHY THIS ROUTE EXISTS. Every other classroom write is a direct RPC call from
 * the browser, and this one was too until item bodies became rich documents.
 * The editor hands back arbitrary ProseMirror JSON -- a teacher pasting
 * instructions out of a document brings headings, tables, spans, inline styles
 * and whatever else the source had -- and turning that into the closed stored
 * shape is real work that must not run anywhere a client could skip or replace
 * it. So `normalizeItemDoc` lives under `$lib/server`, which SvelteKit refuses
 * to bundle into client code, and it runs here. It is the same reason
 * /api/notebook/note exists.
 *
 * IT IS NOT THE BOUNDARY, AND IS NOT TREATED AS ONE. `classroom_create_item`
 * and `classroom_update_item` are granted to `authenticated` and reachable
 * straight through PostgREST, so a caller can bypass this handler entirely.
 * 0108's `_classroom_doc_ok` is what makes that harmless: it REFUSES any
 * document outside the closed shape at the door. This route is the thing that
 * makes a real paste survive; that gate is the thing that makes a hostile one
 * impossible.
 *
 * AUTHORITY IS UNTOUCHED. The RPC runs under the caller's OWN cookie session
 * (`locals.supabase`), so teacher-of-record, publish-target authorization and
 * every refusal message are exactly the database's, exactly as before -- this
 * handler adds a normalization step and nothing else. A 401 here is only the
 * cheap early exit; the RPC would refuse an unauthenticated caller regardless.
 *
 * THE PLAIN-TEXT PROJECTION is derived from the sanitized document and sent
 * alongside it, and the RPC re-derives it too. Belt and braces on purpose: the
 * copy here means a body over the 20,000-character cap is refused with a
 * friendly message before a round trip, and the copy in SQL means the two
 * columns cannot disagree for a caller that never came through here.
 */

interface SaveBody {
	mode?: unknown;
	id?: unknown;
	kind?: unknown;
	sectionIds?: unknown;
	published?: unknown;
	title?: unknown;
	bodyDoc?: unknown;
	points?: unknown;
	dueAt?: unknown;
	category?: unknown;
	links?: unknown;
}

/**
 * Does this error mean the backend predates 0108?
 *
 * Migrations here are applied by hand, so a deployment sitting between two of
 * them is a real state. PostgREST answers an unknown parameter with PGRST202
 * ("could not find the function ... in the schema cache"), which is a DIFFERENT
 * thing from the function refusing the call -- so this matches on that code
 * alone and a genuine refusal is never mistaken for a version mismatch and
 * silently retried (the `isAdmin` PGRST202 rule, and GREENLINE's tiered
 * result-submit fallback).
 */
function isMissingSignature(error: { code?: string } | null): boolean {
	return error?.code === 'PGRST202';
}

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}

	let body: SaveBody;
	try {
		body = (await request.json()) as SaveBody;
	} catch {
		return json({ error: 'Expected a JSON body.' }, { status: 400 });
	}

	const mode = body.mode === 'update' ? 'update' : 'create';

	// THE SANITIZATION STEP. Everything below it works with `doc`, never with
	// what arrived.
	const shaped = itemBodyColumns(body.bodyDoc ?? null);
	if (!shaped.ok) {
		return json({ error: shaped.error }, { status: 400 });
	}

	const title = typeof body.title === 'string' ? body.title : null;
	const category = typeof body.category === 'string' ? body.category : null;
	const points = typeof body.points === 'number' && Number.isFinite(body.points) ? body.points : null;
	const dueAt = typeof body.dueAt === 'string' && body.dueAt !== '' ? body.dueAt : null;
	const links = Array.isArray(body.links) ? body.links : [];
	const published = body.published === null ? null : body.published === true;

	if (mode === 'update') {
		const id = typeof body.id === 'string' ? body.id : '';
		if (!id) return json({ error: 'Which item?' }, { status: 400 });

		const args: Record<string, unknown> = {
			p_id: id,
			p_title: title,
			p_body: shaped.body,
			p_points: points,
			p_due_at: dueAt,
			p_category: category,
			p_published: published,
			p_resources: links,
			p_body_doc: shaped.doc
		};
		let { error } = await supabase.rpc('classroom_update_item', args);
		if (isMissingSignature(error)) {
			// Pre-0108: save the plain text so the teacher does not lose the
			// edit, and let the formatting land once the migration is applied.
			delete args.p_body_doc;
			({ error } = await supabase.rpc('classroom_update_item', args));
		}
		if (error) return json({ error: error.message ?? 'Save failed.' }, { status: 400 });
		return json({ ok: true, item_id: id });
	}

	const kind = typeof body.kind === 'string' ? body.kind : '';
	const sectionIds = Array.isArray(body.sectionIds) ? body.sectionIds.map(String) : [];
	if (!kind) return json({ error: 'Which kind of content?' }, { status: 400 });
	if (!sectionIds.length) {
		return json({ error: 'Pick at least one class to post to.' }, { status: 400 });
	}

	const args: Record<string, unknown> = {
		p_kind: kind,
		p_section_ids: sectionIds,
		p_title: title,
		p_body: shaped.body,
		p_points: points,
		p_due_at: dueAt,
		p_category: category,
		p_published: published !== false,
		p_resources: links,
		p_body_doc: shaped.doc
	};
	let { data, error } = await supabase.rpc('classroom_create_item', args);
	if (isMissingSignature(error)) {
		delete args.p_body_doc;
		({ data, error } = await supabase.rpc('classroom_create_item', args));
	}
	if (error) return json({ error: error.message ?? 'Save failed.' }, { status: 400 });

	const itemId = (data as { item_id?: string } | null)?.item_id;
	if (!itemId) return json({ error: 'The item was not created.' }, { status: 400 });
	return json({ ok: true, item_id: itemId });
};
