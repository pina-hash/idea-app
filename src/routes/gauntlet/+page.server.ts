import { redirect } from '@sveltejs/kit';
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

	const [{ data: profile }, { data: challenges }, { data: mine }, { data: progression }] =
		await Promise.all([
			supabase.from('profiles').select('full_name, role').eq('id', claims.sub).single(),
			// Published challenges per mode (counts + ids for the completion dots).
			supabase
				.from('challenges')
				.select('id, mode, difficulty, created_at')
				.eq('published', true)
				.order('difficulty', { ascending: true })
				.order('created_at', { ascending: true }),
			// The user's best result per challenge (one row each) to count clears.
			supabase.from('gauntlet_leaderboard').select('mode, is_correct').eq('user_id', claims.sub),
			// Progression aggregates (XP, streak days, badges), derived read-only
			// from submissions by the 0021 RPC. Fails soft to null pre-migration.
			supabase.rpc('gauntlet_progression')
		]);

	const totals: Record<string, number> = {};
	const idsByMode: Record<string, string[]> = {};
	for (const c of challenges ?? []) {
		totals[c.mode] = (totals[c.mode] ?? 0) + 1;
		(idsByMode[c.mode] ??= []).push(c.id);
	}
	const cleared: Record<string, number> = {};
	for (const row of mine ?? []) {
		if (row.is_correct) cleared[row.mode] = (cleared[row.mode] ?? 0) + 1;
	}

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		isTeacher: profile?.role === 'teacher',
		modeStats: { totals, cleared, idsByMode },
		progression: progression ?? null
	};
};
