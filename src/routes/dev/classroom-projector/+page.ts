import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the class projector view (ledger 0297, package LIVE).
 * Mounts the REAL ProjectorView with the relocated report control in its
 * strip, exactly as src/routes/classroom/[sectionId]/live/projector/+page@.svelte
 * does. It listens on the same channel as /dev/classroom-live (same viewer, same
 * class), so opening it from that page's Open projector drives it for real.
 *
 *   ?demo=1              seed a frame on this device first (agenda, a running
 *                        ten-minute timer, the hall pass taken, a shown pick,
 *                        Coming up), for a spec that measures the wall on its own
 *   ?demo=timer          a running timer and nothing else, no agenda: the wall
 *                        R12 filed
 *   ?demo=counts         demo 1 plus student activity as counts; `names` with
 *                        the second toggle on; `stale` with activity too old to
 *                        show; `full` the fit stress (twelve agenda lines, three
 *                        Coming up, a class of thirty with names); `clock` no
 *                        timer, the clock as the hero; `bare` the clock and
 *                        nothing else (the side empty)
 *   ?demo=final          no pick, no hall pass, and a countdown in its last
 *                        seconds (7.42 s left); also paused, done, stopwatch
 *                        (the fixture's `demoTimer` names them)
 *   ?clock=pinned        stop this page's clock at load, so a spec reads the
 *                        last seconds and the finish exactly
 *   ?theme=space-white   force the Space White attribute (no session here);
 *                        `matrix` forces Matrix
 *   ?face=dial           the clock face the teacher can turn on (idea
 *                        26033e4b): the seeded frame carries `clockFace: 'dial'`
 *   ?session=1           a faked signed-in TEACHER (`claims` at page level, the
 *                        /dev/themes shape: page data merges over layout data,
 *                        so ThemeRoot reads it as production's). With it the
 *                        page FOLLOWS the site theme stored in this browser and
 *                        any change another window makes (bug 145c0352), which
 *                        is what `_theme-follow.mjs` and the `session-1` spec
 *                        drive. NEVER COMBINED WITH `?theme=`: the forced
 *                        attribute and ThemeRoot would both write `<html>` and
 *                        whichever ran last would win. Without it there is no
 *                        session and ThemeRoot paints nothing, exactly as
 *                        before, so every other spec here is unchanged. Not in
 *                        THEME_BOOT_HARNESSES: nothing here needs a pre-paint.
 *
 * No auth, no Supabase; 404 in production.
 */
export const load: PageLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	if (url.searchParams.get('session') !== '1') return {};
	return { claims: { sub: 'harness-teacher', email: 'teacher@boscotech.edu', exp: 4102444800 } };
};
