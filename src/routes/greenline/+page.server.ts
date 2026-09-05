import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { loadGreenlinePending } from '$lib/greenline/moderation';
import type { PageServerLoad } from './$types';

/**
 * GREENLINE (combat-racing) route. Signed-in tier, any role: hooks.server.ts
 * already redirects anonymous users off `/greenline` to `/`, the portal's
 * standard signed-out handling (mirrored here defensively).
 *
 * There is no role-dependent chrome in the GAME (the teacher-only live tuning
 * panel was removed and is not coming back). What IS role-dependent, and is the
 * one thing added here, is whether the title screen offers a way into the
 * MODERATION queue and says how much is waiting in it.
 *
 * WHY THAT IS A LOAD AND NOT A LINK. GREENLINE takes two kinds of student
 * submission that wait on a teacher -- a community track (0057/0059) and a
 * custom decal (0051) -- and until now nothing inside GREENLINE mentioned
 * either queue. The only way to the track panel was one link on `/dashboard`
 * whose card carried no count, so a teacher who played the game, or who opened
 * GREENLINE because a student asked them to look at something, was told nothing
 * at all. A student can meanwhile race their own pending track and use their own
 * pending decal in their own garage, which is exactly what makes the silence
 * expensive: both sides believe the other has seen it.
 *
 * THE COUNTS ARE GATED ON `isAdmin` BEFORE THEY ARE READ, and the gate is what
 * decides whether they are read at all rather than what decides whether they are
 * shown. Under RLS a student's own read would answer about their own rows, which
 * is a meaningless number and not one any surface should render; not asking is
 * cheaper than filtering. The real boundary for every decision remains
 * `is_teacher()` inside the four review RPCs, and the moderation route's own 404.
 *
 * The build/leaderboard data all flows through the browser Supabase client in
 * the page (the persistence seam), so only the user id is loaded here.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const admin = await isAdmin(supabase, claims.sub);

	return {
		userId: claims.sub,
		canModerate: admin,
		// `ready: false` for everyone else, which is what every surface reads as
		// "say nothing" -- the same answer a pre-0051/0059 deployment gives.
		pending: admin
			? await loadGreenlinePending(supabase)
			: { ready: false, tracks: 0, decals: 0, total: 0 }
	};
};
