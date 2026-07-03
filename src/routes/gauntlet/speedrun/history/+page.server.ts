import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The signed-in user's Speedrun attempt history (0033). Reads the
 * gauntlet_speedrun_attempt_history view, which persists every attempt
 * (passed / failed / abandoned) written server-side by the attempt triggers.
 * RLS scopes the view to the caller's own rows.
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

	const { data: attempts } = await supabase
		.from('gauntlet_speedrun_attempt_history')
		.select('id, challenge_id, challenge_title, series_name, elapsed_ms, result, room_id, created_at')
		.eq('user_id', claims.sub)
		.order('created_at', { ascending: false })
		.limit(100);

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		attempts: (attempts ?? []) as Array<{
			id: string;
			challenge_id: string;
			challenge_title: string;
			series_name: string | null;
			elapsed_ms: number | null;
			result: 'in_progress' | 'passed' | 'failed' | 'abandoned';
			room_id: string | null;
			created_at: string;
		}>
	};
};
