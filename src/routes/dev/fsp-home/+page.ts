import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * FSP homepage-section verification harness. Dev-only: 404s in a production build
 * so it never ships. Needs no login or Supabase — it mounts the REAL
 * FspHomeSection with a sample FSP section and stubs the open-state as local
 * component state, so the grouped dividers, HUD brackets, drifting grid backdrop,
 * live pulse, and opened progress dots can be exercised in a plain browser.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
