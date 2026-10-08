import { requireFeedbackConsole } from '$lib/server/feedback-console';
import type { LayoutServerLoad } from './$types';

/**
 * THE FEEDBACK AREA'S GATE, HOISTED (2026-10-07): the area is three pages now
 * -- the site queue, the Armory app's notes and its incidents -- so the gate is
 * stated once here and a fourth page cannot ship ungated by somebody forgetting
 * to copy it (CLAUDE.md, "a group-wide gate is hoisted to +layout.server.ts";
 * the /maps/edit precedent).
 *
 * EVERY PAGE STILL CALLS IT FIRST, AND THAT IS LOAD-BEARING RATHER THAN
 * DEFENCE IN DEPTH: SvelteKit runs this load and a page's server load
 * concurrently unless the page awaits `parent()`, so a 404 thrown here does not
 * stop a page's reads from starting. A non-admin gets the same 404 at every
 * address and no read is made on their behalf.
 *
 * It never reads `url`, so it does not re-run on a navigation between the
 * three pages.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	await requireFeedbackConsole(locals);
	return {};
};
