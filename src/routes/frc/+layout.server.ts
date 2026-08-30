import { loadUserProgress } from '$lib/frc/progression';
import { completedCadCount, rankForCount } from '$lib/frc/track';
import { canReviewFrc } from '$lib/server/frc-review';
import type { LayoutServerLoad } from './$types';

/**
 * Loads the signed-in student's FRC progression once for every /frc page, so
 * the domain landing can show real per-unit states and the shell + track view
 * can show the rank. Fails soft to "nothing complete" if the migration is
 * unapplied. (The /frc guard in hooks.server.ts already requires a session, but
 * we still handle the anonymous case defensively for the dev harness path.)
 *
 * `frcCanReview` is the REVIEWER-tier answer (0167 via canReviewFrc, admin
 * folded in), loaded here once so FrcShell and every /frc page read one value:
 * it gates the "View as student" toggle, the in-track completion override and
 * the Review tab. Convenience only -- the RPCs and policies re-check.
 */
export const load: LayoutServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return {
			frcCompleted: [] as string[],
			frcCompletedCount: 0,
			frcRank: rankForCount(0),
			frcCanReview: false
		};
	}
	const [rows, frcCanReview] = await Promise.all([
		loadUserProgress(supabase, claims.sub),
		canReviewFrc(supabase, claims.sub)
	]);
	const completed = rows.map((r) => r.unit_id);
	const count = completedCadCount(new Set(completed));
	return {
		frcCompleted: completed,
		frcCompletedCount: count,
		frcRank: rankForCount(count),
		frcCanReview
	};
};
