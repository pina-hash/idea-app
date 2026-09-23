import { redirect } from '@sveltejs/kit';
import { loadClassroomWork } from '$lib/classroom/student-work';
import type { PageServerLoad } from './$types';

/**
 * A student's to-do across every class (ledger 0297). Signed-in tier, any role:
 * /classroom is in hooks.server.ts authedPrefixes, so an anonymous visitor gets
 * the standard 303 to `/` and this redirect is belt-and-braces.
 *
 * THE READ IS THE SHARED ONE, `loadClassroomWork`, the same the site home and
 * My Classes make: classes, items with their postings and the caller's own
 * view stamp, submissions, and the caller's own check-ins. Every read runs as
 * the caller under RLS, so a student receives only their classes, their
 * published items and their own work, and there is no role branch here.
 *
 * THE KEYS ARE NESTED UNDER `todo` ON PURPOSE. Page data merges over the
 * classroom layout's, and the layout hands `page.data.items`, `units` and
 * `checkIns` to the command palette as "the class on screen"; a to-do returning
 * `items` at the top would put every class's assignments in that list.
 *
 * THIS LOAD READS NO `url`. The view and the class a door opened the page on
 * are read by the page from the address, so choosing another view is a change
 * of the address and never a second round trip.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, parent }) => {
	if (!claims) redirect(303, '/');

	const layout = parent();
	const work = await loadClassroomWork(supabase, {
		userId: claims.sub,
		email: (claims.email as string | undefined) ?? '',
		isAdmin: layout.then((d) => d.isAdmin === true),
		checkIns: true
	});

	return {
		todo: work,
		todoEmail: (claims.email as string | undefined) ?? '',
		todoIsAdmin: (await layout).isAdmin === true
	};
};
