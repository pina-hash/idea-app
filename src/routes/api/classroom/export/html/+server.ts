import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { exportHtmlBackfill } from '$lib/server/classroom-export';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

/**
 * EXPORT EVERY HTML ASSIGNMENT TO THE REPO, ONCE (ledger 0431, report
 * a71b7b8a). Each ported document, its manifest and its rubric land in
 * `materials/<course>/<slug>/`, the same folder a save now writes, for the
 * documents that were uploaded before the per-save export knew about them.
 *
 * ADMIN ONLY, AND ANYONE ELSE GETS THE SITE'S 404, so the existence of the
 * action is not public. Because the handler calls `isAdmin(`, the connector's
 * build gives Mr. Pina a tool for it on the next push to main, with nobody
 * asked ("export every HTML assignment to the repo").
 *
 * SAFE TO RUN AGAIN: a batch whose files are already in the repo commits
 * nothing (see `exportHtmlBackfill`). It never 500s on a failed export; the
 * answer says which items landed and which did not, and why.
 */
export const POST: RequestHandler = async ({ locals }) => {
	const supabase = locals.supabase as SupabaseClient;
	const claims = locals.claims;
	if (!claims || !(await isAdmin(supabase, claims.sub))) return json({ error: 'Not found' }, { status: 404 });
	const result = await exportHtmlBackfill(supabase);
	return json(result);
};
