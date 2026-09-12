import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for CLASSROOM PRESENCE (0200). Mounts the REAL
 * `GradingConsole` with the REAL `PresenceLine` and `PresenceChip` inside it,
 * and the REAL `PresenceHeartbeat` component beside it -- not a copy of any of
 * their markup -- against an in-memory fixture. No auth, no Supabase, no
 * network. 404s in production.
 *
 * WHY A ROUTE OF ITS OWN RATHER THAN A MOUNT ON `/dev/grading-bulk`. The claim
 * here is that FOUR STATES are distinguishable on a roster row at 375px and
 * 1440px, which needs a fixture holding one of each plus the fifth case the
 * payload cannot carry (a student with no row). Every existing grading harness
 * has a roster whose presence would be identical for every student, which is a
 * fixture that cannot tell a correct renderer from one that prints the same
 * chip four times.
 *
 * THE FIXTURE IS BUILT RELATIVE TO THE REAL CLOCK, deliberately, and this is the
 * one harness in the tree where a pinned instant would be WRONG rather than
 * merely inconvenient. Presence is a function of elapsed time -- `now -
 * last_seen`, `now - last_input` -- and the console threads its own real `now`
 * down to every row. A fixture pinned to a literal would drift further from it
 * every day until every row read `away`, and the page would go on looking
 * plausible. So the offsets are what is fixed and the instants are derived.
 *
 * `?state=` FORCES ONE STATE ONTO EVERY ROW, which is what a browser spec needs
 * to measure one chip's contrast against a known ground without hunting for the
 * row that happens to carry it.
 *
 * `?presence=off` REMOVES THE TRANSPORT, which is the negative control for
 * every presence assertion: a console on a deployment where 0200 has not been
 * applied draws no presence region at all, and a spec that only ever saw the
 * region present could not tell that from a region that is always drawn.
 *
 * THE HEARTBEAT HALF IS THE STUDENT SIDE, driven through the in-memory twin in
 * `presence/transports.ts` -- which applies the SAME 20-second throttle and the
 * SAME credit rule the database does, so the counter on screen is what a real
 * period would produce and not a number this page made up.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
