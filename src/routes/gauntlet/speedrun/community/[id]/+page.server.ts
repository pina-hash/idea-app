import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { RouteDetail } from '$lib/gauntlet/community';

/**
 * ONE COMMUNITY SPEEDRUN (0296, ledger 0433): its parts in order, the caller's
 * progress on each, and its board. `gauntlet_route` answers anyone signed in
 * who holds the link unless a reviewer took it down; "not found" and "not
 * yours" are the same 404. The published parts are offered to the owner for
 * editing.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, params }) => {
	if (!claims) error(401, 'Sign in to play.');

	const [{ data: profile }, routeRes] = await Promise.all([
		supabase.from('profiles').select('full_name, role').eq('id', claims.sub).single(),
		supabase.rpc('gauntlet_route', { p_route_id: params.id })
	]);
	if (routeRes.error || !routeRes.data) error(404, 'Speedrun not found.');
	const route = routeRes.data as RouteDetail;

	const { data: parts } = route.mine
		? await supabase
				.from('challenges')
				.select('id, title, difficulty')
				.eq('mode', 'speedrun')
				.eq('published', true)
				.order('difficulty', { ascending: true })
				.order('title', { ascending: true })
		: { data: [] };

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		route,
		parts: (parts ?? []) as Array<{ id: string; title: string; difficulty: number }>
	};
};
