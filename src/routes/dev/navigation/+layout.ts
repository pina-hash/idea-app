import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

/**
 * Dev-only harness for the ROUTE-TRANSITION INDICATOR and the shared pending
 * primitive. 404s in a production build; no auth, no Supabase, no fixture data
 * of any kind -- the whole surface is two links and a probe.
 *
 * THE GUARD IS ON THE LAYOUT, not on each page, because this route group has a
 * CHILD (`[delay]`) whose whole purpose is to be navigated to. A per-page guard
 * would be one more thing the next state added here has to remember, which is
 * the argument CLAUDE.md already makes for hoisting a group-wide gate.
 *
 * IT READS NO `url`. A layout load that reads `url` re-runs on every navigation
 * (CLAUDE.md), which would defeat the one property this harness depends on:
 * the layout, and therefore the probe's own results, surviving the navigations
 * it is measuring.
 */
export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
