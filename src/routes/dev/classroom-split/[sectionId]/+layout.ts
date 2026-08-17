import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { ITEMS, SECTION, UNITS, loads } from '../fixture';
import type { LayoutLoad } from './$types';

/**
 * Dev-only harness for the TWO-PANE class shell. Mounts the REAL ClassSplit,
 * ClassView, ItemDetail and ClassroomShell against fixture data, in a route
 * tree shaped exactly like the real one -- a layout load plus a child page
 * load -- so what it measures is the shipping structure and not a mock of it.
 *
 * The real routes need a real session and a real Supabase project, which this
 * repo's placeholder .env cannot provide; this is what makes the geometry, the
 * breakpoint and the state-preservation claims drivable anyway. 404s in
 * production.
 *
 * THIS LOAD TAKES NO `url` DEPENDENCY, exactly like the real one, which is the
 * whole reason it does not re-run when you open an item.
 */
export const prerender = false;

export const load: LayoutLoad = async () => {
	if (!dev) error(404, 'Not found');
	loads.layout += 1;
	return { section: SECTION, items: ITEMS, units: UNITS, layoutLoads: loads.layout };
};
