/**
 * Server-side helper: the suggested next drawing after a run. The lowest
 * difficulty published challenge in the same mode the user has not cleared
 * yet (excluding the one just played), or null when the mode is fully clear.
 *
 * "CLEARED" IS READ OFF THE STUDENT'S OWN `submissions` ROWS, NEVER THE BOARD.
 * `gauntlet_leaderboard` is a RANKING: since 0154 it drops a passing Speedrun
 * run under the 30s plausibility floor from the board entirely. 0154's header
 * lists this helper as "NOT AFFECTED" because it filters `is_correct` itself.
 * That is true of a WRONG knowledge answer (the row arrives with is_correct
 * false and is dropped either way) and false of a FAST CORRECT modeling run:
 * that row is not in the view at all, so there is nothing to filter, and a
 * student whose only pass on a level was under the floor kept being offered
 * that level as "next" after every run. The floor is a forgery control on the
 * BOARD; `gauntlet_macro_submit` still returns `is_correct` and still writes
 * the `submissions` row, so the pass counts as cleared here (RLS: own-row
 * select, granted since 0004).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GauntletModeId } from '$lib/gauntlet';

export interface NextChallenge {
	href: string;
	title: string;
}

export async function nextUncleared(
	supabase: SupabaseClient,
	userId: string,
	mode: GauntletModeId,
	basePath: string,
	excludeId: string
): Promise<NextChallenge | null> {
	const [{ data: siblings }, { data: mine }] = await Promise.all([
		supabase
			.from('challenges')
			.select('id, title, difficulty')
			.eq('mode', mode)
			.eq('published', true)
			.neq('id', excludeId)
			.order('difficulty', { ascending: true })
			.order('created_at', { ascending: true }),
		supabase
			.from('submissions')
			.select('challenge_id, is_correct')
			.eq('user_id', userId)
			.eq('mode', mode)
	]);
	const cleared = new Set(
		(mine ?? []).filter((r) => r.is_correct === true).map((r) => r.challenge_id as string)
	);
	const next = (siblings ?? []).find((c) => !cleared.has(c.id as string));
	if (!next) return null;
	return { href: `${basePath}/${next.id}`, title: next.title as string };
}
