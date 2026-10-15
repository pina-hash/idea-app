import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAdmin } from '$lib/server/admin';
import { areaAllowed, type CoinDeskAreaId, type CoinStaffScope } from '$lib/coin-desk/nav';

/**
 * WHO MAY OPEN THE COIN DESK, AND HOW MUCH OF IT (decision 68, migration
 * 0244). The one server-side read of a caller's coin tier.
 *
 *   `full`     the owner, and whoever the settings page lists: every area.
 *   `section`  every other site admin, and every class's teacher of record:
 *              the fine screen, the queue, payday, the digest and the student
 *              view, over their own students only.
 *   null       anybody else: every Coin Desk page answers 404.
 *
 * Before 0244 is applied the function does not exist (PGRST202 / 42883), and
 * the desk is what it was: a site admin is full staff, nobody else is staff.
 * Any other error answers null, so it fails closed. This is convenience with
 * teeth: every coin RPC re-checks the same tier inside the database.
 */
export interface CoinStaff {
	scope: CoinStaffScope;
	sections: { id: string; label: string }[];
	/** False when this deployment's database has not had 0244 applied yet. */
	scoped: boolean;
}

export async function coinStaff(
	supabase: SupabaseClient,
	userId: string | null | undefined
): Promise<CoinStaff | null> {
	if (!userId) return null;
	let answer: { data: unknown; error: { code?: string } | null };
	try {
		answer = await supabase.rpc('coin_staff_scope');
	} catch {
		return null;
	}
	if (answer.error) {
		const code = answer.error.code ?? '';
		if (code === 'PGRST202' || code === '42883') {
			return (await isAdmin(supabase, userId)) ? { scope: 'full', sections: [], scoped: false } : null;
		}
		return null;
	}
	const d = (answer.data ?? {}) as { scope?: string | null; sections?: { id: string; label: string }[] };
	if (d.scope !== 'full' && d.scope !== 'section') return null;
	return { scope: d.scope, sections: Array.isArray(d.sections) ? d.sections : [], scoped: true };
}

/**
 * A page's own first statement: the area's tier, asked again. SvelteKit runs a
 * layout's server load and a page's concurrently, so the layout's 404 does not
 * stop a page's reads from starting; each page asks for itself.
 */
export async function requireCoinArea(
	supabase: SupabaseClient,
	userId: string | null | undefined,
	area: CoinDeskAreaId
): Promise<CoinStaff> {
	const staff = await coinStaff(supabase, userId);
	if (!staff || !areaAllowed(area, staff.scope)) error(404, 'Not found');
	return staff;
}
