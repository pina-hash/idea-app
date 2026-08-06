import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import {
	DEFAULT_SPEEDRUN_RULESET,
	type GauntletModeId,
	type GauntletSeries,
	type SpeedrunRuleset
} from '$lib/gauntlet';

/**
 * ADMIN-only authoring (0067): the challenge management list. Admins see ALL
 * challenges (drafts, published, archived) via the RLS read policy whose
 * is_teacher() now resolves to the admin check; nobody else reaches this
 * route. The gate is server-side, mirroring the dashboard (hooks.server.ts
 * already blocks anonymous users off /gauntlet*), and the authoring RPCs
 * re-check server-side regardless.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
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

	const { data: challenges } = await supabase
		.from('challenges')
		.select('id, mode, title, difficulty, status, updated_at, series_id, series_order')
		.order('mode', { ascending: true })
		.order('difficulty', { ascending: true })
		.order('title', { ascending: true });

	// The one global Speedrun ruleset (shared across every challenge, not per row).
	const { data: rules } = await supabase
		.from('gauntlet_speedrun_ruleset')
		.select('units_label, projection, rule_lines')
		.maybeSingle();

	// Drawing series (0022), for the series-management section.
	const { data: series } = await supabase
		.from('gauntlet_series')
		.select('id, name, description, sort_order')
		.order('sort_order', { ascending: true })
		.order('name', { ascending: true });

	return {
		userName: profile?.full_name ?? claims.email ?? 'Teacher',
		userRole: profile?.role ?? 'teacher',
		myUserId: claims.sub,
		challenges: (challenges ?? []) as Array<{
			id: string;
			mode: GauntletModeId;
			title: string;
			difficulty: number;
			status: 'draft' | 'published' | 'archived';
			updated_at: string;
			series_id: string | null;
			series_order: number | null;
		}>,
		series: (series ?? []) as GauntletSeries[],
		ruleset: (rules ?? DEFAULT_SPEEDRUN_RULESET) as SpeedrunRuleset
	};
};
