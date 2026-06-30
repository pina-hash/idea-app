import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { modeById, type GauntletModeId } from '$lib/gauntlet';

/** New-challenge form. Teacher-only (server-checked), with an optional ?mode=. */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, url }) => {
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

	const mode = (modeById(url.searchParams.get('mode'))?.id ?? 'speedrun') as GauntletModeId;

	return {
		userName: profile?.full_name ?? claims.email ?? 'Teacher',
		userRole: profile?.role ?? 'teacher',
		mode
	};
};
