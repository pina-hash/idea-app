import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for THE GRADING CONSOLE'S WORK PANE ON A PORTED HTML
 * ASSIGNMENT. Mounts the REAL `GradingConsole` and the REAL
 * `HtmlAssignmentFrame`, pointed at the REAL `/hx/worksheet` route, against an
 * in-memory fixture. No auth, no Supabase, no network. 404s in production.
 *
 * WHY IT EXISTS. Measured in production at `89b8154` on 2026-09-10: opening
 * `/classroom/<s>/item/<i>/grade` on a schema-3 assignment gave a roster
 * reading "In progress", a rubric that rendered, and an EMPTY WORK PANE. The
 * grade load never asked whether the item was a ported document, so `spec` came
 * back null, no `htmlWork` snippet was passed, and the work column fell through
 * every branch it has. Mr. Pina could not grade at all. Nothing above the
 * screen was wrong: the responses were stored, the manifest was stored, the
 * rubric was stored, and `GradingConsole` had carried the `htmlWork` seam since
 * 0195. Only the wiring was missing, which is exactly the class of defect a
 * type check cannot see and a unit test of either component passes through.
 *
 * `?state=empty` SELECTS THE STUDENT WITH NO ANSWERS, which is a state this
 * console must render as the UNTOUCHED DOCUMENT and not as a blank pane. It is
 * its own URL because a route spec measures one URL and "has not started" is a
 * different claim from "here is the work".
 *
 * THE IMAGE URL IS A REGISTERED LOCAL ONE (`registerLocalSubmissionFileUrl`,
 * the existing dev-harness override the attachment surfaces already use), so
 * the photo strip draws a real decoded picture rather than the proxy's 404.
 * The proxy itself needs a session and a row and is not reachable from here;
 * what this measures is the STRIP -- its layout, its wrapping and its contrast
 * -- and `?state=broken` measures the other half, the fallback row a thumbnail
 * that will not decode falls back to.
 *
 * WHAT IT CANNOT STAND IN FOR, said plainly: the frame is pointed at
 * `/hx/worksheet`, a FIXTURE document, because a real ported document is a
 * database row and there is no import path from a harness. The seeding, the
 * field mapping, the read-only posture and the strip are all real; which
 * BYTES arrive is not.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
