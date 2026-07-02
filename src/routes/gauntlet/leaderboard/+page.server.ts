import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Overall GAUNTLET leaderboard. Auth-gated with the rest of /gauntlet. Both
 * boards come from the single read-only `gauntlet_leaderboards()` RPC (0024),
 * which derives everything from graded submissions (nothing forgeable) and is
 * readable by any signed-in user, students and teachers alike. Fails soft to
 * empty boards pre-migration.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const [{ data: profile }, { data: boards }] = await Promise.all([
		supabase.from('profiles').select('full_name, role').eq('id', claims.sub).single(),
		supabase.rpc('gauntlet_leaderboards', { p_limit: 100 })
	]);

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		myUserId: claims.sub,
		boards: (boards ?? { overall: [], speedrun: [] }) as {
			overall: OverallRow[];
			speedrun: SpeedrunRecordRow[];
		}
	};
};

export interface OverallRow {
	user_id: string;
	display_name: string | null;
	full_name: string | null;
	avatar: string | null;
	avatar_url: string | null;
	attempted: number;
	cleared: number;
	practice_days: number;
	xp: number;
	rank: number;
}

export interface SpeedrunRecordRow {
	challenge_id: string;
	title: string;
	difficulty: number;
	par_time: number | null;
	best_time: number | null;
	user_id: string | null;
	display_name: string | null;
	full_name: string | null;
	avatar: string | null;
	avatar_url: string | null;
}
