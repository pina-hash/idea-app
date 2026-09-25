import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for what a student owes (ledger 0298, R14 and R27): the
 * REAL ClassView as a student, the REAL MyClasses with the to-do's counts,
 * and the REAL home feed card as the class's teacher, over one fixture and one
 * pinned clock. No auth, no Supabase; 404 in production.
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
