import { error, redirect } from '@sveltejs/kit';
import type { CoinCategory } from '$lib/coin-desk';
import { logClasses } from '$lib/coin-desk/log';
import { areaAllowed } from '$lib/coin-desk/nav';
import { coinStaff } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * Log: the day-to-day view -- find a student, log a fine/award/purchase
 * against them, the students you tick, or a whole class.
 *
 * A FULL COIN ADMIN'S AREA (decision 68). Section coin staff land on the
 * fine screen instead of a 404, because `/coin-desk` is the desk's own front
 * door and every one of them may open the desk: a 404 there would read as
 * "you have no coin powers", which is false. Anybody else still gets the
 * layout's 404.
 *
 * THE CLASSES ARE IDEA CLASSROOM SECTIONS (IDEA Coin V2 session two). The
 * pre-V2 coin sections are retired (0251); `coin_fine_sections()` lists the
 * caller's economy-on classes with a roster count, and a class's roster is
 * read on the client when it is picked (coin_fine_roster).
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	// `requireCoinArea`'s own rule, asked once, so a section tier can be sent
	// on rather than refused.
	const staff = await coinStaff(supabase, claims?.sub);
	if (staff?.scope === 'section') redirect(303, '/coin-desk/fine');
	if (!staff || !areaAllowed('log', staff.scope)) error(404, 'Not found');

	const [{ data: categories, error: catError }, fine] = await Promise.all([
		// Loggable categories in the price list's own order; the view filters to
		// active-only for the picker (a retired category stays readable in a
		// student's history but can never be logged again). Editing the price
		// list itself lives on /coin-desk/economy.
		supabase
			.from('coin_categories')
			.select(
				'id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, notes, active'
			)
			.eq('loggable', true)
			.order('sort_order'),
		supabase.rpc('coin_fine_sections')
	]);

	return {
		categories: (categories ?? []) as CoinCategory[],
		// Fails soft: an empty, clearly-flagged category list rather than a
		// crashed page.
		configured: !catError,
		// The economy-on classes with a count; the layout's scope list where
		// that read failed (any error), which names the classes with no count.
		classes: logClasses(
			fine.error
				? null
				: ((fine.data ?? []) as { id: string; label: string; students?: number | string | null }[]),
			staff.sections
		)
	};
};
