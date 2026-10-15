import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
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
 * The admin gate for the WHOLE /coin-desk route group -- Log, Fine, Students,
 * Debt, Contracts, Roles, Economy, Settings. Hoisting it here means a new area
 * cannot ship ungated by forgetting to copy the check.
 *
 * Gated on is_admin() specifically (0067: teacher alone grants nothing
 * elevated), not profiles.role, since every write RPC these pages call is
 * itself gated on is_admin() -- this check is convenience-with-teeth, the
 * RPCs are the boundary.
 *
 * A non-admin gets 404, not a redirect -- the /admin rule, so a probing
 * request learns nothing about whether the page exists. Deliberately NOT in
 * hooks.server.ts authedPrefixes for the same reason: an anonymous visitor
 * should get the same 404 a signed-in non-admin gets.
 */
export const load: LayoutServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
	await autopayCatchUp(supabase);
	return {};
};
