import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the grading console's POST-GRADE CHANGE signal and its
 * EXTRA CREDIT control. Mounts the REAL `GradingConsole` -- not a copy of its
 * markup -- against an in-memory fixture. No auth, no Supabase, no network.
 * 404s in production.
 *
 * WHY ITS OWN ROUTE. `/dev/grading-incomplete` is the five INCOMPLETENESS
 * states and nothing writes to its fixture but the console; bending it into
 * these states would change what that harness is for. `/dev/classroom`'s
 * engine fixture is shared with six views that write to it. This one is inert
 * in the same way its sibling is.
 *
 * THE FIVE STATES -- THREE FLAGGED AND TWO CONTROLS. The count matters: a
 * signal that fired on everybody would satisfy a presence check and be
 * worthless, so two of the five must come back clean for two different reasons.
 *
 *
 *   Alice Alvarez   graded, work untouched since   -- THE POSITIVE CONTROL.
 *                                                     No change chip may
 *                                                     render for her, at any
 *                                                     width.
 *   Ben Okafor      graded, then EDITED a response -- the silent half: nobody
 *                                                     asked for anything and
 *                                                     the graded artefact is
 *                                                     no longer the graded
 *                                                     artefact.
 *   Carla Cardenas  graded, then RESUBMITTED       -- the deliberate half.
 *                                                     Must read as its own
 *                                                     act, not as "changed".
 *   Dara Nwosu      graded, resubmitted AND edited -- both kinds on one row.
 *   Eli Ramos       SUBMITTED, never graded, with  -- THE SECOND CONTROL, and
 *                   responses newer than every       the one that catches a
 *                   other row                        derivation keyed on the
 *                                                     response time alone
 *                                                     rather than on there
 *                                                     being a grade to be
 *                                                     after.
 *
 * Alice also carries an EXTRA CREDIT award, so the score on screen (18) is
 * visibly past the rubric total (20 -> her rubric sum is 15) and the
 * itemisation beside the total has something to show. `extraCreditReady` is
 * true here: a deployment sitting before 0171 is the other branch and the
 * harness exposes a switch for it rather than a second route.
 *
 * NOTHING IS WRITTEN DOWN TWICE. The oracle table below the console prints
 * what `postGradeChange` itself answers for each row, so a browser pass
 * compares the console against the pure function rather than against a label
 * somebody typed next to it.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
