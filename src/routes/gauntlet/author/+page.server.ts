import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { GauntletModeId } from '$lib/gauntlet';

/**
 * Teacher-only authoring: the challenge management list. Teachers see ALL
 * challenges (drafts, published, archived) via the teacher RLS read policy;
 * students never reach this route. The role check is server-side, mirroring the
 * dashboard (hooks.server.ts already blocks anonymous users off /gauntlet*).
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

	const { data: challenges } = await supabase
		.from('challenges')
		.select('id, mode, title, difficulty, status, updated_at')
		.order('mode', { ascending: true })
		.order('difficulty', { ascending: true })
		.order('title', { ascending: true });

	return {
		userName: profile?.full_name ?? claims.email ?? 'Teacher',
		userRole: profile?.role ?? 'teacher',
		challenges: (challenges ?? []) as Array<{
			id: string;
			mode: GauntletModeId;
			title: string;
			difficulty: number;
			status: 'draft' | 'published' | 'archived';
			updated_at: string;
		}>
	};
};
