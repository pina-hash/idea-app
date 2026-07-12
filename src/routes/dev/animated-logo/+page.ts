import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * AnimatedLogo verification harness. Dev-only: 404s in production so it never
 * ships. No auth or Supabase, so the emblem's spin, reduced-motion gating, and
 * header-scale sizing can be eyeballed in a plain browser.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
