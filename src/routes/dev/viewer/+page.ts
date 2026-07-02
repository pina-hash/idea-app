import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * DrawingViewer verification harness. Dev-only: it 404s in a production build so
 * it never ships. Lives OUTSIDE /gauntlet on purpose, so it needs no login or
 * Supabase, letting the viewer's interactions be exercised in a plain browser.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
