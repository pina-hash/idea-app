import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * GAUNTLET visuals verification harness. Dev-only: it 404s in a production
 * build so it never ships. Lives OUTSIDE /gauntlet on purpose, so it needs no
 * login or Supabase, letting the volumetric background, the 3D preview, and
 * the thumbnail pipeline be exercised in a plain browser.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
