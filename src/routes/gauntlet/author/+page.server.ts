import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Teacher-only authoring entry point, stubbed for now (the full authoring UI is
 * a later prompt). Anonymous users are already redirected off /gauntlet* by
 * hooks.server.ts; here we additionally redirect non-teachers back to the dojo,
 * since the role lives in `profiles` (same pattern as /dashboard).
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

	if (profile?.role !== 'teacher') {
		redirect(303, '/gauntlet');
	}

	// Challenge counts per mode (published + drafts), for the authoring overview.
	const { data: challenges } = await supabase.from('challenges').select('mode');
	const counts: Record<string, number> = {};
	for (const c of challenges ?? []) {
		counts[c.mode] = (counts[c.mode] ?? 0) + 1;
	}

	return {
		userName: profile?.full_name ?? claims.email ?? 'Teacher',
		userRole: profile?.role ?? 'teacher',
		counts
	};
};
