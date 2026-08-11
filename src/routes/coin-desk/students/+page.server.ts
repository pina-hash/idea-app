import type { CoinSectionRow } from '$lib/coin-desk/sections';
import type { PageServerLoad } from './$types';

/**
 * Students: sections + rosters (0073), plus balance lookup and signed
 * adjustments by email (0070, moved here from /admin). Admin-gating lives
 * once in the group's +layout.server.ts.
 *
 * Unlike the Log area this loads EVERY section, archived ones included --
 * archiving is reversible and a section keeps its roster and history, so it
 * has to stay visible and reactivatable here.
 */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data: sections, error: sectionsError } = await supabase.rpc('coin_admin_list_sections');

	return {
		sections: (sections ?? []) as CoinSectionRow[],
		// Fails soft: 0073 not applied yet reads as an empty, clearly-flagged
		// section list rather than a crashed page. The balance tool below it
		// only needs 0070 and keeps working either way.
		sectionsConfigured: !sectionsError
	};
};
