import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { LayoutServerLoad } from './$types';

/**
 * THE REVIEW LANE'S GATE, STATED ONCE FOR THE AREA (ledger 0360).
 *
 * The lane became two pages -- the queue and `/foundry/review/publishers` --
 * the moment there was a second one, and CLAUDE.md's rule for that is to
 * hoist the gate to the group's `+layout.server.ts` so a third page cannot
 * ship ungated by somebody forgetting to copy a check (the `/maps/edit`
 * shape). Each page keeps its own identical check as defence in depth.
 *
 * 404, NEVER A REDIRECT OR A 403: the existence of a review lane is not
 * public. The real boundary is still `is_admin()` inside every RPC these
 * pages call.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const uid = locals.claims?.sub ?? null;
	if (!uid) error(404, 'Not found');
	if (!(await isAdmin(locals.supabase, uid))) error(404, 'Not found');
	return {};
};
