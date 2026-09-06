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
 * WHY IT IS A SECOND HARNESS BESIDE `/dev/classroom`. That harness drives the
 * shell across many `/classroom` paths and answers "does the right tab light
 * up where"; this one answers "does the BAR survive its own tab count", which
 * is a geometric question and needs the two widths and the wrap probe rather
 * than a path list.
 *
 * IT USED TO CARRY A LOCAL FIVE-TAB FIXTURE AND NO LONGER DOES. 0081 could not
 * ship the duplicates tab -- its page was on an unmerged branch behind an
 * unapplied `0187`, so the tab would have been a 404 offered to every manager
 * -- but the bar at that count could still be measured honestly with a fixture
 * that never left this route. 0074's page landed on `main`, 0086 landed the
 * tab, and the fixture went with it: five is what `sectionTabs()` returns now,
 * so a hand-built fifth tab beside the real one would be the copy that drifts.
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
