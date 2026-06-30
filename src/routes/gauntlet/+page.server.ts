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

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	// Published challenge counts per mode.
	const { data: challenges } = await supabase
		.from('challenges')
		.select('id, mode')
		.eq('published', true);

	// The user's best result per challenge (one row each) to count clears.
	const { data: mine } = await supabase
		.from('gauntlet_leaderboard')
		.select('mode, is_correct')
		.eq('user_id', claims.sub);

	const totals: Record<string, number> = {};
	for (const c of challenges ?? []) {
		totals[c.mode] = (totals[c.mode] ?? 0) + 1;
	}
	const cleared: Record<string, number> = {};
	for (const row of mine ?? []) {
		if (row.is_correct) cleared[row.mode] = (cleared[row.mode] ?? 0) + 1;
	}

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		isTeacher: profile?.role === 'teacher',
		modeStats: { totals, cleared }
	};
};
