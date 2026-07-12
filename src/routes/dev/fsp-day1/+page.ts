import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * FSP Day 1 deck harness. Dev-only: 404s in a production build so it never
 * ships. Mounts the real FspDeck with no Supabase and sample questions, so the
 * full slide flow (nav, scaling, full screen) and slide 13's embedded live feed
 * (both empty and populated states) are browser-verifiable without auth or a DB.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
