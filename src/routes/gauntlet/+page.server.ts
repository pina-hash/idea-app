import { redirect } from '@sveltejs/kit';
import { canAuthorGauntlet } from '$lib/server/gauntlet-authoring';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * GAUNTLET landing. The section is auth-gated in hooks.server.ts (anonymous
 * users are redirected off /gauntlet*), so claims are present here; we guard
 * again defensively. We load the profile for the header and per-mode stats
 * (published challenge count and how many the user has cleared) to drive the
 * mode-select grid's progression.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const [{ data: profile }, { data: challenges }, { data: mine }, { data: progression }, canAuthor] =
		await Promise.all([
			supabase.from('profiles').select('full_name, role').eq('id', claims.sub).single(),
			// Published challenges per mode (counts + ids for the completion dots).
			supabase
				.from('challenges')
				.select('id, mode, difficulty, created_at')
				.eq('published', true)
				.order('difficulty', { ascending: true })
				.order('created_at', { ascending: true }),
			// The student's own history, never the board: `gauntlet_leaderboard` is
			// a RANKING and, since 0154, drops a passing Speedrun run under the 30s
			// plausibility floor from the board entirely. 0154's header lists this
			// page as "NOT AFFECTED" because it filters `is_correct` itself. That
			// is true of a WRONG knowledge answer (the row arrives with is_correct
			// false and is skipped either way) and false of a FAST CORRECT modeling
			// run: that row is not in the view at all, so there is nothing to
			// filter and the clear simply goes uncounted. The floor is a forgery
			// control on the BOARD; `gauntlet_macro_submit` still returns
			// `is_correct` and still writes the `submissions` row, and the pass
			// counts as cleared. So clears are counted off `submissions` (RLS:
			// own-row select, granted since 0004), the same source the mode list
			// loaders read; the board keeps bestTime/rank, which this page never
			// asks for.
			supabase
				.from('submissions')
				.select('challenge_id, mode, is_correct')
				.eq('user_id', claims.sub),
			// Progression aggregates (XP, streak days, badges), derived read-only
			// from submissions by the 0021 RPC. Fails soft to null pre-migration.
			supabase.rpc('gauntlet_progression'),
			// Authoring is its own allowlisted tier since 0155, not admin-only.
			canAuthorGauntlet(supabase, claims.sub)
		]);

	// 0194: THE REVIEW CONSOLE'S ONE ROUTE INTO THE UI.
	//
	// `/gauntlet/run-review` has existed since 0152 and NOTHING IN `src/` HAS
	// EVER LINKED TO IT -- it was reachable only by typing the URL. That is what
	// made `0154`'s promise ("every unranked run is a run the console already
	// reports") true of the data and false of anybody's day, and it is half of
	// what decision 19 says a held state buys: a queue for the page to be a
	// queue OF.
	//
	// ADMIN ONLY, AND ASKED ONLY FOR ADMINS. The count is null for everybody
	// else, never zero: a zero would be a claim about a queue this caller may
	// not read, and the card keys on null to render nothing at all.
	// `gauntlet_run_review` is deliberately NOT on the author tier (0155 left it
	// on `is_admin()` because authoring a question is not a licence to read what
	// was answered), so this reads `isAdmin` and not `canAuthor`.
	const admin = await isAdmin(supabase, claims.sub);
	let heldCount: number | null = null;
	if (admin) {
		// A FILTER on a new column fails exactly as selecting one does --
		// PostgREST refuses `42703` and fails the whole request -- and 0194 is
		// applied by hand, so this is try-then-fall-back rather than a ladder
		// with a second rung: there is no narrower way to ask this question, and
		// the honest answer on a pre-0194 deployment is "cannot tell".
		const { count, error: countError } = await supabase
			.from('gauntlet_leaderboard')
			.select('user_id', { count: 'exact', head: true })
			.eq('rank_state', 'pending_verification');
		heldCount = countError ? null : (count ?? 0);
	}

	const totals: Record<string, number> = {};
	const idsByMode: Record<string, string[]> = {};
	for (const c of challenges ?? []) {
		totals[c.mode] = (totals[c.mode] ?? 0) + 1;
		(idsByMode[c.mode] ??= []).push(c.id);
	}
	// DISTINCT challenge ids, and only PUBLISHED ones. The board gave one row
	// per (player, challenge) and carried `where c.published`; `submissions`
	// carries every attempt and knows nothing about publication, so without
	// both a level cleared twice would count twice and a clear on a challenge
	// unpublished since would push `cleared` above `totals`.
	const clearedIds: Record<string, Set<string>> = {};
	for (const row of mine ?? []) {
		if (row.is_correct !== true) continue;
		if (!idsByMode[row.mode]?.includes(row.challenge_id)) continue;
		(clearedIds[row.mode] ??= new Set()).add(row.challenge_id);
	}
	const cleared: Record<string, number> = {};
	for (const [mode, ids] of Object.entries(clearedIds)) cleared[mode] = ids.size;

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		canAuthorGauntlet: canAuthor,
		// `isAdmin` IS NOT RETURNED HERE. The root layout already puts it on
		// `page.data`, and page data merges OVER layout data -- so returning a
		// second copy would shadow the one every other surface reads with an
		// answer computed a second way. `admin` above is local, and its only job
		// is deciding whether to ASK for the count.
		//
		// Null means either "not an admin" or "0194 is not applied here". The
		// card renders a way in with no number on it in both cases.
		heldCount,
		modeStats: { totals, cleared, idsByMode },
		progression: progression ?? null
	};
};
