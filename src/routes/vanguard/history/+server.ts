import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Retired: the standalone run-history portal page was fully replaced by the
 * in-game RUN HISTORY panel (src/lib/legacy/vanguard/index.html). Old links
 * and bookmarks to this URL land on the game itself instead of 404ing.
 */
export const GET: RequestHandler = () => {
	redirect(308, '/vanguard/');
};
