import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for THE DOORS, which are the two things this lane added and
 * the two things nothing else can measure.
 *
 * It mounts the REAL `ClassroomShell` fed by the REAL `sectionTabs()`, and the
 * REAL `GreenlineDashboardCard` fed by real `GreenlinePending` values. No auth,
 * no Supabase, no router; 404s in production.
 *
 * WHY IT IS A SECOND HARNESS BESIDE `/dev/classroom` RATHER THAN A STATE ADDED
 * TO IT. That harness drives the shell at the tab counts the shipping tree
 * has: three for a manager, one for a student. What has to be proven here is
 * the count it CANNOT reach -- five tabs, which is what the bar holds the day
 * the duplicate-drafts page lands and its tab joins the four that ship today.
 * The bar wraps rather than overflowing precisely so that day needs no second
 * look at the stylesheet, and a claim about a state no fixture reaches is not
 * a measurement. The extra tabs here are a LOCAL fixture, deliberately: adding
 * them to `sectionTabs()` to make them measurable is the 404-for-every-manager
 * this lane refused to ship.
 *
 * The GREENLINE card is here because its three states -- work waiting, nothing
 * waiting, and a count that could not be read -- have no other harness at all,
 * and the middle one is the whole reason `pendingLabel` says "NOTHING AWAITING
 * REVIEW" instead of rendering an empty badge.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
