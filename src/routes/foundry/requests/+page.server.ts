import { error } from '@sveltejs/kit';
import { foundrySiteOff } from '$lib/foundry/access';
import type { FoundryGameRequest } from '$lib/foundry/requests';
import type { PageServerLoad } from './$types';

/**
 * THE GAME REQUEST BOARD'S READ (report b2ba6d74, ledger 0360).
 *
 * ONE READ, AS THE CALLER. `foundry_game_requests(true)` returns the open
 * requests and the closed ones (the page splits them), never an address, and
 * projects `hidden` only to an admin and to the request's own author. The
 * population is the definer's; this load adds no filter.
 *
 * READ ON PAGE LOAD ONLY, NO POLL: a board changes a few times a day.
 *
 * NOT BEHIND A CLASS CLOSURE (`requests` is not in `FOUNDRY_CLOSURE_BLOCKS`):
 * the board runs no student's bundle. The WHOLE-FOUNDRY switch does reach it,
 * and this load then returns nothing, because the board names other students.
 *
 * `PGRST202` IS A DEPLOYMENT WITHOUT 0230; the page says the board is not on
 * yet instead of failing.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { foundryAccess } = await parent();
	if (foundrySiteOff(foundryAccess)) {
		return { requests: [] as FoundryGameRequest[], available: true };
	}

	const { data, error: err } = await locals.supabase.rpc('foundry_game_requests', {
		p_include_closed: true
	});
	if (err) {
		if (err.code === 'PGRST202') return { requests: [] as FoundryGameRequest[], available: false };
		error(500, err.message);
	}
	return {
		requests: (Array.isArray(data) ? data : []) as FoundryGameRequest[],
		available: true
	};
};
