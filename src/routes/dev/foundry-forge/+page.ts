import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE FORGE IDENTITY HARNESS. Dev-only: 404s in a production build, needs no
 * auth and no Supabase. It mounts the REAL room pieces -- the shell, the
 * molten seam, the status chips, FoundryMine -- with fixture data that puts
 * every lifecycle state on screen at once (draft, submitted, approved, live,
 * rejected, hidden), which no real account can do on demand. This is the page
 * the viewport, reduced-motion and animation-cost measurements drive.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
