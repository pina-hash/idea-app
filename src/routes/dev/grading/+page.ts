import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the GRADES TAB's order. Mounts the REAL `GradesPanel`
 * -- not a copy of its markup -- against an in-memory fixture. No auth, no
 * Supabase, no network. 404s in production.
 *
 * WHY ITS OWN ROUTE RATHER THAN `/dev/classroom`'s MOUNT. That page mounts
 * this panel with three assignments, all dated, all in one order, which is a
 * fixture that cannot tell a correct sort from an incorrect one: any
 * comparator that is not actively broken produces the same list. The claim
 * here is about ORDER, so the fixture has to be one whose right answer differs
 * per key and differs from the order it is handed in.
 *
 * THE FIXTURE IS DELIBERATELY ADVERSARIAL, and every row exists for a reason:
 *
 *   * The input order is neither answer. Rows are supplied shuffled, so a
 *     comparator that returned 0 for everything would leave them shuffled and
 *     fail rather than accidentally pass.
 *   * TWO rows carry NO due date, so the undated group has more than one
 *     member and its own internal order is checkable.
 *   * A row with the MOST waiting to be marked is NOT the one most recently
 *     due, so `due` and `queue` genuinely disagree at the top. A fixture where
 *     the two keys agree proves nothing about which one is running.
 *   * TWO rows share a `created_at` to the millisecond -- transaction time, the
 *     roster-import case -- so the id tiebreak is the only thing separating
 *     them and a comparator that stopped at `created_at` would leave them in
 *     whatever order the input happened to have.
 *   * One dated row is due in the FUTURE and one is long past, so "newest due
 *     first" is distinguishable from "nearest to now".
 *
 * THE ORACLE BELOW THE PANEL PRINTS `orderStandings`'s OWN ANSWER for both
 * keys, so a browser pass compares the rendered list against the pure function
 * rather than against a list somebody typed out beside it.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
