import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * The tab icon harness (ledger 0396). Dev-only: 404s in production. No auth,
 * no Supabase. Every glyph and state drawn by the shipping geometry at real
 * size on six tab grounds, the three home-screen icons on a wallpaper, and
 * keys that drive THIS tab's live icon through every state, so the real tab
 * strip can be watched.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
