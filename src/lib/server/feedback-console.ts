import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';

/**
 * THE FEEDBACK CONSOLE'S GATE, ONCE, FOR BOTH OF ITS ADDRESSES.
 *
 * The console lives at `/admin/feedback` since report R03 (decision 42): it
 * reads reports from every surface on the site, so it left the classroom for
 * the admin area, and `/classroom/feedback` became a 307 to it. That old
 * address runs THIS gate before it redirects, so a non-admin gets the same 404
 * at both and a redirect never confirms the console exists to someone it is
 * refusing. One function called from two loads, the shape
 * `$lib/server/notebook-review-console` gives the notebook's legacy review
 * address, because two copies of "who may open this" are two things that can
 * stop agreeing.
 *
 * A non-admin gets a 404 rather than a redirect (the /admin rule): probing the
 * URL should tell a curious student nothing at all. `/admin` is deliberately
 * NOT in hooks.server.ts `authedPrefixes`, so an anonymous visitor reaches the
 * new address's load and gets the same 404 as a signed-in student.
 *
 * CONVENIENCE, NOT THE BOUNDARY: app_feedback_admin_list and
 * app_feedback_set_status both open with is_admin() inside the function body,
 * so a hand-rolled PostgREST call is refused by the database, not by a load.
 * `isAdmin` fails closed on any error but the missing-function code.
 */
export async function requireFeedbackConsole({
	supabase,
	claims
}: Pick<App.Locals, 'supabase' | 'claims'>): Promise<void> {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
}
