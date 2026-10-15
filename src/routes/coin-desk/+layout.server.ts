import { error } from '@sveltejs/kit';
import { coinStaff } from '$lib/server/coin-scope';
import type { LayoutServerLoad } from './$types';

/**
 * How long the autopay catch-up may hold up a Coin Desk load. A run is
 * throttled server-side (one every two minutes unless an admin presses Run),
 * so nearly every call answers at once; this bounds the rare slow one.
 */
const AUTOPAY_CATCH_UP_MS = 4000;

/**
 * IDEA COIN V2 (0242): AUTOPAY CATCHES UP WHENEVER SOMEONE OPENS THE DESK.
 * `coin_autopay_run('page')` pays whatever wages and awards are still owed
 * and is idempotent, so calling it on every load is safe. BEST EFFORT, AND
 * NOTHING ABOUT IT CAN FAIL THE LOAD: an error (including PGRST202 / 42883 on
 * a database without 0242), a thrown exception and a slow answer are all
 * ignored. The Coin Desk home lists what each run paid.
 */
async function autopayCatchUp(supabase: App.Locals['supabase']): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			(async () => {
				await supabase.rpc('coin_autopay_run', { p_trigger: 'page' });
			})(),
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, AUTOPAY_CATCH_UP_MS);
			})
		]);
	} catch {
		// Best effort: the desk loads whatever happened here.
	} finally {
		clearTimeout(timer);
	}
}

/**
 * The coin staff gate for the WHOLE /coin-desk route group. Hoisting it here
 * means a new area cannot ship ungated by forgetting to copy the check; each
 * page still asks for itself (`requireCoinArea`), because a layout's load and
 * a page's run concurrently.
 *
 * TWO TIERS (decision 68, 0244): a full coin admin opens every area; section
 * coin staff (every other admin, every class's teacher of record) open the
 * fine screen, the queue, payday, the digest and the student view, over their
 * own students. The database enforces both; this decides what is offered.
 *
 * Anybody else gets 404, not a redirect, so a probing request learns nothing
 * about whether the page exists; deliberately NOT in authedPrefixes for the
 * same reason. WHICH AREA a tier may open is each page's own first
 * statement (`requireCoinArea`), never this load's: a layout load must not
 * read `url`, or it re-runs on every navigation inside the desk.
 */
export const load: LayoutServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	const staff = await coinStaff(supabase, claims.sub);
	if (!staff) error(404, 'Not found');
	await autopayCatchUp(supabase);
	return { coinStaff: staff };
};
