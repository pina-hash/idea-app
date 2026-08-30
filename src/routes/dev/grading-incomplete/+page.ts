import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the grading console's INCOMPLETE-SUBMISSION signal
 * (0160). Mounts the REAL `GradingConsole` -- not a copy of its markup --
 * against an in-memory fixture. No auth, no Supabase, no network. 404s in
 * production.
 *
 * WHY ITS OWN ROUTE RATHER THAN /dev/classroom's ?view=grade. That harness
 * mounts the console too, but its engine fixture is SHARED with six other
 * views that write to it (the class page, the item detail, the assignment
 * engine, the bulk tools), so the roster it shows is whatever those views last
 * did to it -- one seeded student across three assignments, twenty filler
 * names, and no submitted row on the graded item at all. Bending it into the
 * five states this signal has to be read against would change what every one
 * of those views renders. This fixture is inert: nothing writes to it but the
 * console itself.
 *
 * THE FIVE STATES, chosen so each control has a counterpart that must NOT
 * carry the mark:
 *
 *   Alice Alvarez  submitted, every check met      -- THE POSITIVE CONTROL.
 *                                                     Nothing about
 *                                                     incompleteness may
 *                                                     render for her.
 *   Ben Okafor     submitted, six checks unmet     -- all five block kinds
 *                                                     plus the declaration.
 *   Carla Cardenas submitted, exactly one unmet    -- the singular wording
 *                                                     ("1 requirement", "the
 *                                                     same note").
 *   Dara Nwosu     NOT submitted, work started     -- THE SECOND CONTROL, and
 *                  and plainly unfinished             the one that would catch
 *                                                     a signal keyed on the
 *                                                     unmet count alone rather
 *                                                     than on having handed in.
 *   Eli Ramos      RETURNED and graded, two unmet  -- the mark survives a
 *                  (a closed approval gate and       return, and the approval
 *                  a short photo zone)               kind is exercised.
 *
 * The counts are NOT written down anywhere in the fixture: the harness prints
 * what `specUnmet` itself answers for each row, so a browser pass compares the
 * console against the pure function rather than against a number somebody
 * typed next to it.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
