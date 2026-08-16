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
	publishAt?: unknown;
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
	const publishAt =
		typeof body.publishAt === 'string' && body.publishAt !== '' ? body.publishAt : null;
	const links = Array.isArray(body.links) ? body.links : [];
	const published = body.published === null ? null : body.published === true;

	/**
	 * Two OPTIONAL parameters, two migrations, applied by hand and separately --
	 * so this drops them one at a time rather than all at once. Dropping both on
	 * the first refusal would cost a project that HAS 0108 its rich body to work
	 * around a missing 0109. The order is newest-first, matching the read chain
	 * in `selectItemsWithDoc`.
	 *
	 * Each retry is gated on PGRST202 ALONE (see `isMissingSignature`): a genuine
	 * refusal -- a caller who does not manage one of the target sections, a body
	 * over the cap -- must surface as itself, never be silently retried into a
	 * weaker call that then succeeds.
	 */
	async function callWithDegrade(fn: 'classroom_create_item' | 'classroom_update_item', args: Record<string, unknown>) {
		let res = await supabase.rpc(fn, args);
		if (isMissingSignature(res.error) && 'p_publish_at' in args) {
			const { p_publish_at: _dropped, ...rest } = args;
			res = await supabase.rpc(fn, rest);
			if (isMissingSignature(res.error) && 'p_body_doc' in rest) {
				const { p_body_doc: _alsoDropped, ...bare } = rest;
				res = await supabase.rpc(fn, bare);
			}
		}
		return res;
	}

	if (mode === 'update') {
		const id = typeof body.id === 'string' ? body.id : '';
		if (!id) return json({ error: 'Which item?' }, { status: 400 });

		const { error } = await callWithDegrade('classroom_update_item', {
			p_id: id,
			p_title: title,
			p_body: shaped.body,
			p_points: points,
			p_due_at: dueAt,
			p_category: category,
			p_published: published,
			p_resources: links,
			p_body_doc: shaped.doc,
			p_publish_at: publishAt
		});
		if (error) return json({ error: error.message ?? 'Save failed.' }, { status: 400 });
		return json({ ok: true, item_id: id });
	}

	const kind = typeof body.kind === 'string' ? body.kind : '';
	const sectionIds = Array.isArray(body.sectionIds) ? body.sectionIds.map(String) : [];
	if (!kind) return json({ error: 'Which kind of content?' }, { status: 400 });
	if (!sectionIds.length) {
		return json({ error: 'Pick at least one class to post to.' }, { status: 400 });
	}

	const { data, error } = await callWithDegrade('classroom_create_item', {
		p_kind: kind,
		p_section_ids: sectionIds,
		p_title: title,
		p_body: shaped.body,
		p_points: points,
		p_due_at: dueAt,
		p_category: category,
		p_published: published !== false,
		p_resources: links,
		p_body_doc: shaped.doc,
		p_publish_at: publishAt
	});
	if (error) return json({ error: error.message ?? 'Save failed.' }, { status: 400 });

	const itemId = (data as { item_id?: string } | null)?.item_id;
	if (!itemId) return json({ error: 'The item was not created.' }, { status: 400 });
	return json({ ok: true, item_id: itemId });
};
