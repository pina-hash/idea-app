import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * FSP live Q&A verification harness. Dev-only: it 404s in a production build so
 * it never ships. Shows /fsp/ask and /fsp/live side by side in iframes so a
 * signed-in tester can submit on the ask side and watch it appear on the live
 * side over Realtime (same-origin cookies flow into both iframes). Needs the
 * 0043 migration applied and real Google sign-in; there is nothing to mock.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
