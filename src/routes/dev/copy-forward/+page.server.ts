import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * DEV ONLY. 404 in production, no auth, no Supabase, no network -- the harness
 * mounts the REAL `CopyForwardPanel` with a plan shaped exactly as 0318's
 * `classroom_copy_forward_preview` answers (ledger 0455).
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
