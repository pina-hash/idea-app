import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { LayoutServerLoad } from './$types';

/**
 * The admin gate for the WHOLE /coin-desk route group -- Log, Students,
 * Contracts, Roles, Economy, Migrate. Previously this lived in the single
 * page's own +page.server.ts; hoisting it here means a new area cannot ship
 * ungated by forgetting to copy the check.
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
	return {};
};
