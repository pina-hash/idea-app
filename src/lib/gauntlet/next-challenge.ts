/**
 * Server-side helper: the suggested next drawing after a run. The lowest
 * difficulty published challenge in the same mode the user has not cleared
 * yet (excluding the one just played), or null when the mode is fully clear.
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
			.from('gauntlet_leaderboard')
			.select('challenge_id, is_correct')
			.eq('user_id', userId)
			.eq('mode', mode)
	]);
	const cleared = new Set(
		(mine ?? []).filter((r) => r.is_correct).map((r) => r.challenge_id as string)
	);
	const next = (siblings ?? []).find((c) => !cleared.has(c.id as string));
	if (!next) return null;
	return { href: `${basePath}/${next.id}`, title: next.title as string };
}
