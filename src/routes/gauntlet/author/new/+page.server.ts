import { redirect } from '@sveltejs/kit';
import { canAuthorGauntlet } from '$lib/server/gauntlet-authoring';
import type { PageServerLoad } from './$types';
import { modeById, type GauntletModeId } from '$lib/gauntlet';

/**
 * New-challenge form. Open to the AUTHOR TIER since 0155 (server-checked),
 * optional ?mode=.
 *
 * A refused caller is sent to `/gauntlet/author`, which is where the refusal is
 * SPOKEN. One panel, on the list page, rather than a third and fourth copy of
 * the same sentence on the two form routes -- and the destination explains
 * itself, which is the whole difference between this and the bounce to
 * `/gauntlet` that an audit found reading as a broken link.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, url }) => {
	if (!claims) {
		redirect(303, '/');
	}

	if (!(await canAuthorGauntlet(supabase, claims.sub))) {
		redirect(303, '/gauntlet/author');
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
