import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the teacher's Live class (ledger 0297, package LIVE).
 * Mounts the REAL ClassroomShell with the class's real tabs (Live current)
 * around the REAL LiveControl, over a fixture roster, a presence payload built
 * from offsets against the real clock, a grading read with every hand-in
 * state, and an in-memory hall pass. The projector link opens
 * /dev/classroom-projector, which listens on the same channel, so two pages of
 * one browser can be driven together. No auth, no Supabase; 404 in production.
 *
 *   ?theme=space-white   force the Space White attribute (no session here)
 *   ?presence=off        no presence transport: every row says Not known
 *   ?item=<id>           the item to watch first (the class page's door)
 *   ?timer=<kind>        a timer already running when the view opens
 *                        (running, ready, final, paused, done, stopwatch:
 *                        the fixture's `demoTimer`)
 *   ?clock=pinned        stop the control view's clock at load
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
