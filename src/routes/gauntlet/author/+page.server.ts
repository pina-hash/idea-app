import { redirect } from '@sveltejs/kit';
import {
	canAuthorGauntlet,
	GAUNTLET_AUTHORING_REFUSAL
} from '$lib/server/gauntlet-authoring';
import type { PageServerLoad } from './$types';
import {
	DEFAULT_SPEEDRUN_RULESET,
	type GauntletModeId,
	type GauntletSeries,
	type SpeedrunRuleset
} from '$lib/gauntlet';

/**
 * The challenge management list, open to the AUTHOR TIER since 0155 and not
 * only to admins. An author sees ALL challenges (drafts, published, archived)
 * through the 0004 read policy, which 0155 re-gated onto
 * `gauntlet_can_author()`; the authoring RPCs re-check server-side regardless,
 * so this guard is convenience.
 *
 * A REFUSED CALLER IS TOLD, NOT BOUNCED. This route used to `redirect(303,
 * '/gauntlet')`, which is what an audit found reading as a broken link: a
 * teacher who followed a link somebody sent them landed back on the dojo with
 * nothing anywhere saying why, and the honest answer -- "you need a permission
 * you do not have, here is who grants it" -- was the one thing the page could
 * not say. THE REDIRECT ALSO BOUGHT NO SECRECY: a redirect confirms a route
 * exists (which is exactly why CLAUDE.md's probing rule uses 404 for surfaces
 * whose existence is private), so it disclosed the same fact while being less
 * useful about it. The page now renders `refusal` in the app's own chrome.
 *
 * An ANONYMOUS caller still goes to `/`, unchanged: there is nobody to tell.
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

	if (!(await canAuthorGauntlet(supabase, claims.sub))) {
		// Short-circuit: none of the reads below would raise, they would simply
		// come back empty under RLS, and an empty authoring console is precisely
		// the "is it broken or am I refused" ambiguity this branch removes.
		return {
			userName: profile?.full_name ?? claims.email ?? 'Signed in',
			userRole: profile?.role ?? 'student',
			myUserId: claims.sub,
			refusal: GAUNTLET_AUTHORING_REFUSAL,
			challenges: [],
			series: [],
			ruleset: DEFAULT_SPEEDRUN_RULESET
		};
	}

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
		refusal: null,
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
