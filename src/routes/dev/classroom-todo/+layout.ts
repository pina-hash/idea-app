import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

/**
 * Dev-only harness for a student's cross-class to-do (ledger 0297). Mounts the
 * REAL ClassroomShell (with the To-do door, the Search and Settings tools it
 * carries on the real route) around the REAL TodoPage at `/todo` and the REAL
 * MyClasses at the root, over fixture rows and one pinned clock. No auth, no
 * Supabase; 404 in production.
 */
export const load: LayoutLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
