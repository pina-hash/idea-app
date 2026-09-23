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
 *                        ten-minute timer, the hall pass taken, a shown pick),
 *                        for a spec that measures the wall on its own
 *   ?demo=timer          the same with no pick and no hall pass
 *   ?theme=space-white   force the Space White attribute (no session here)
 *
 * No auth, no Supabase; 404 in production.
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
