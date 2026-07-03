import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * Co-op netcode latency spike. Dev-only: 404s in a production build so it
 * never ships. Measures whether Supabase Realtime broadcast can carry
 * VANGUARD co-op traffic on a school network; touches no game code.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
