import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for GRADING AT SCALE: the REAL `GradingConsole` with the
 * bulk transport handed in, mounted against an in-memory fixture. Not a copy of
 * its markup, no auth, no Supabase, no network. 404s in production.
 *
 * WHY ITS OWN ROUTE. `/dev/grading-change` is the post-grade signal and the
 * extra-credit control against a five-student single-section fixture, and
 * `/dev/grading-incomplete` is the five incompleteness states; bending either
 * into three classes would change what those harnesses are for and would move
 * every number their browser specs assert.
 *
 * THE FIXTURE IS THREE CLASSES AND ONE ASSIGNMENT, which is the shape the
 * schema actually has: `classroom_items` is canonical, `classroom_postings` is
 * the join, and `classroom_submissions` is keyed `(item_id, student_email)`
 * with no section at all.
 *
 *   IDEA100 · Period 1   Alice, Ben, Carla, Dara   -- the caller MANAGES this
 *   IDEA100 · Period 2   Eli, Fatima, Gus          -- the caller MANAGES this
 *   IDEA100 · Period 4   Hana, Idris               -- SOMEBODY ELSE teaches it
 *
 * PERIOD 4 IS THE NEGATIVE CONTROL AND IT IS NOT DECORATION. The postings
 * policy (0109) admits a section the caller can merely READ, so a console that
 * listed "the classes this is posted to" without intersecting against the
 * managed set would name Period 4, list its students, and refuse every grade in
 * it -- which is a disclosure wearing the clothes of a permissions error. The
 * harness therefore holds the WHOLE posting list and the WHOLE roster and calls
 * `managedPostedSections`, exactly as the real transport and the real page load
 * do, so opening that one clause makes Period 4 appear here and in production
 * alike.
 *
 * THE SWITCHES, and only three of them, because the interesting states are
 * REACHED BY CLICKING rather than seeded. A "batch armed" query parameter would
 * be a second way into a state the controls already produce, and a browser pass
 * driving the real presets and the real arm button proves something a seeded
 * fixture cannot.
 *   `?state=pre-0171`  `extraCreditReady` false: the deployment sitting before
 *                      the extra-credit migration.
 *   `?state=single`    The bulk transport WITHHELD. The positive control for
 *                      "absence is the mechanism": no checkboxes, no presets, no
 *                      batch bar, no section chips exist in that render at all.
 *   `?leak=1`          The cross-section clause OPEN, so Period 4 appears. The
 *                      positive control for the refusal.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
