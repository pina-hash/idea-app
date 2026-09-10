import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { isScheduled } from '$lib/classroom/classroom';
import { UUID_RE } from '$lib/server/notebook-upload';

/**
 * THE STORED BYTES OF ONE PORTED HTML ASSIGNMENT, READ FOR A HOST THAT HOLDS NO
 * SESSION.
 *
 * `/hx/<document id>` answers on the SANDBOX ORIGIN. That origin has no session
 * cookie on it -- the absence IS the security model, not a browser declining to
 * send one -- so no request arriving there can satisfy an RLS policy, and
 * `classroom_html_assignments`' own policy ("the document follows its item")
 * cannot be the thing that decides. The read is therefore made with the SERVICE
 * ROLE and every rule RLS would have enforced is re-checked HERE, on every
 * request, explicitly. This is the same shape as `serveBundleFile` in
 * `$lib/server/foundry-bundle.ts`, for the same reason, and that module's header
 * is worth reading beside this one.
 *
 * ONE MODULE KNOWS THE CREDENTIAL. This is the only reader of
 * `SUPABASE_SERVICE_ROLE_KEY` for anything HTML-assignment shaped: the serving
 * route imports this and never builds a client of its own. **CLAUDE.md's
 * "read by exactly FOUR places" sentence is now out of date -- this is a
 * FIFTH** (GREENLINE community-track publish, the tournament push sender, the
 * anonymous feedback route, Foundry's `foundry-bundle.ts`, and this). That
 * sentence is in a file this lane does not own; it is reported rather than
 * edited.
 *
 * WHAT IT RE-CHECKS, AND WHY EACH ONE IS SEPARATE:
 *
 *   1. THE HANDLE IS A UUID. `document_id` is a uuid column, so anything else
 *      cannot name a row -- refusing it here means the database is never asked
 *      about a string somebody typed, and it is what keeps the dev fixture ids
 *      (`worksheet`, `probe`, which are deliberately NOT uuids) in a namespace
 *      that provably cannot collide with a real document.
 *   2. THE ROW EXISTS. One row, by handle, and nothing else is looked up by.
 *   3. THE ITEM IS AN ASSIGNMENT AND IS LIVE. `published`, and either no
 *      `publish_at` or one that has passed -- which is `_classroom_item_live`
 *      (0109), the condition every classroom read already uses. Expressed as
 *      `published && !isScheduled(...)` rather than re-typed, because a second
 *      spelling of "is this visible yet" is the pair that stops agreeing.
 *
 * THE PUBLICATION GATE IS NOT A SESSION CHECK, AND THAT IS FORCED RATHER THAN
 * CHOSEN, exactly as it is for a Foundry bundle. Requiring a signed-in caller
 * here means either `Domain`-scoping the portal's cookies onto the sandbox host
 * -- which hands every uploaded document the credentials the second origin
 * exists to withhold -- or putting a signed token on every request, which is the
 * machinery Foundry spent five lanes removing. So the licence comes from the
 * ITEM'S OWN PUBLICATION STATE.
 *
 * WHAT THAT COSTS, STATED RATHER THAN DISCOVERED: **a teacher cannot preview an
 * UNPUBLISHED item's document.** The frame renders empty and reads as a broken
 * upload. The answer when that has to close is the one Foundry already worked
 * out and is NOT a looser gate here: a second read on the PORTAL origin that
 * gates on WHO IS ASKING (`previewBundleFile`'s shape), because that is the only
 * origin where the question can be asked at all. A flag on this function would
 * put one boolean between every unpublished document and the open internet.
 *
 * EVERY REFUSAL IS THE SAME ANSWER. An unparseable handle, an unknown one, an
 * item that is not an assignment, an unpublished item, a scheduled one and a
 * deployment with no service key are indistinguishable to the caller, which is
 * what stops a document id being probed for.
 */

/** The bytes, or the one refusal. No reason: the route answers a bodyless 404. */
export type HxStoredDocument = { ok: true; html: string } | { ok: false };

const REFUSED: HxStoredDocument = { ok: false };

/**
 * The service-role client. Built per call rather than held at module scope, the
 * way `foundry-bundle.ts` builds its own: the key is read through
 * `$env/dynamic/private`, so a module-scope client would capture whatever the
 * environment held at import time and an unset key would be permanent.
 */
function admin() {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) return null;
	return createClient(PUBLIC_SUPABASE_URL, key, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

/** Is a service-role read possible on this deployment at all. Read by the dev
    harness, which otherwise cannot tell "no such document" from "no key". */
export function hxDocumentStoreConfigured(): boolean {
	return Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * One stored document by its public handle, if and only if it may be served.
 *
 * NOTHING REWRITES A STORED BYTE. What comes back is the `document` column
 * verbatim -- the same bytes the manifest was read out of at import, and the
 * same bytes a reviewer reads. The route adds headers and nothing else.
 */
export async function hxStoredDocument(documentId: string): Promise<HxStoredDocument> {
	if (!UUID_RE.test(documentId)) return REFUSED;

	const client = admin();
	if (!client) return REFUSED;

	const { data: row, error: rowErr } = await client
		.from('classroom_html_assignments')
		.select('item_id, document')
		.eq('document_id', documentId)
		.maybeSingle<{ item_id: string; document: string }>();
	if (rowErr || !row || typeof row.document !== 'string' || row.document === '') return REFUSED;

	const { data: item, error: itemErr } = await client
		.from('classroom_items')
		.select('id, kind, published, publish_at')
		.eq('id', row.item_id)
		.maybeSingle<{ id: string; kind: string; published: boolean; publish_at: string | null }>();
	if (itemErr || !item) return REFUSED;
	if (item.kind !== 'assignment') return REFUSED;
	// `publish_at` is ALWAYS selected above, so `isScheduled`'s undefined branch
	// (which reads an unselected column as live) is unreachable from here. It
	// matters that it is unreachable rather than merely unlikely: that branch is
	// correct for a display chip and would be a hole in an access decision.
	if (!item.published || isScheduled(item)) return REFUSED;

	return { ok: true, html: row.document };
}
