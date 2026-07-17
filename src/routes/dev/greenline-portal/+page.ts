import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * GREENLINE portal-flow verification harness. Dev-only: 404s in a production
 * build so it never ships. Needs no login or Supabase: it mounts the REAL
 * Garage (with the /greenline route's own labels/props) and the REAL
 * GreenlineResults with sample data, so the two presentational flow screens can
 * be exercised in a plain browser. The full signed-in loop (auth + persistence)
 * runs only on /greenline itself.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
