import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE GAME REQUEST BOARD HARNESS (report b2ba6d74, ledger 0360). Dev only: 404
 * in production, no auth, no Supabase. The REAL board, in the room and inside
 * `FoundryPage`, twice: as a student sees it (post and close) and as an admin
 * sees it (post, close and hide), over one in-memory fixture.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
