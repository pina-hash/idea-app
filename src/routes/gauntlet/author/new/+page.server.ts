import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import { modeById, type GauntletModeId } from '$lib/gauntlet';

/** New-challenge form. Admin-only since 0067 (server-checked), optional ?mode=. */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, url }) => {
	if (!claims) {
		redirect(303, '/');
	}

	if (!(await isAdmin(supabase, claims.sub))) {
		redirect(303, '/gauntlet');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	const mode = (modeById(url.searchParams.get('mode'))?.id ?? 'speedrun') as GauntletModeId;

	return {
		userName: profile?.full_name ?? claims.email ?? 'Teacher',
		userRole: profile?.role ?? 'teacher',
		mode
	};
};
