import { error } from '@sveltejs/kit';
import { canReviewFrc } from '$lib/server/frc-review';
import { loadReviewQueue } from '$lib/frc/gate-submissions';
import type { PageServerLoad } from './$types';

/**
 * The FRC gate-review console, for the REVIEWER tier (0167): the surface where
 * an allowlisted reviewer (or an admin) reads pending modeling-gate
 * submissions and approves or returns them. The admin dashboard keeps its own
 * copy of this queue; this route is what makes the capability usable by a
 * reviewer who is not an admin, since /dashboard stays admin-only.
 *
 * A NON-REVIEWER GETS 404, the same as the Foundry review queue and GAUNTLET
 * run review: a review lane over student work is not a surface whose existence
 * is public, and "not found" and "not yours" must answer identically. (The
 * /frc prefix guard in hooks.server.ts already bounced the signed-out.)
 *
 * The guard is convenience -- frc_can_review() inside the policies and RPCs is
 * the boundary -- but here it also keeps the load honest: without it a
 * non-reviewer would get an EMPTY queue from the definer function, and an
 * empty console is indistinguishable from a working one.
 *
 * Fails soft: with 0167 unapplied, an admin (whom canReviewFrc still admits
 * via its PGRST202 degrade to isAdmin) sees an apply-migration note naming the
 * file, the FRC convention since 0039.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims || !(await canReviewFrc(supabase, claims.sub))) {
		error(404, 'Not found');
	}
	const { ready, rows } = await loadReviewQueue(supabase);
	return { reviewQueueReady: ready, reviewQueue: rows };
};
