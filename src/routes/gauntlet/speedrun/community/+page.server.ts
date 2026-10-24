import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { RouteSummary } from '$lib/gauntlet/community';

/**
 * COMMUNITY SPEEDRUNS: the list and the builder (0296, ledger 0433). The list
 * is `gauntlet_routes()`, which answers only what the caller may see: listed
 * speedruns, the caller's own, and (for a GAUNTLET author or an admin) the
 * review queue. The builder offers published Speedrun parts by name only; the
 * database re-checks every part on save.
 *
 * `unavailable` is a deployment before 0296 (PGRST202 alone); every other
 * error is a failed read and says so, never an empty list.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: profile }, routesRes, partsRes] = await Promise.all([
		supabase.from('profiles').select('full_name, role').eq('id', claims.sub).single(),
		supabase.rpc('gauntlet_routes'),
		supabase
			.from('challenges')
			.select('id, title, difficulty, series_id, series_order')
			.eq('mode', 'speedrun')
			.eq('published', true)
			.order('difficulty', { ascending: true })
			.order('title', { ascending: true })
	]);

	const err = routesRes.error as { code?: string; message?: string } | null;
	const payload = (routesRes.data ?? null) as { can_review?: boolean; routes?: RouteSummary[] } | null;

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		state: err ? (err.code === 'PGRST202' ? 'unavailable' : 'error') : 'ok',
		canReview: payload?.can_review === true,
		routes: payload?.routes ?? [],
		parts: (partsRes.data ?? []) as Array<{ id: string; title: string; difficulty: number }>
	};
};
