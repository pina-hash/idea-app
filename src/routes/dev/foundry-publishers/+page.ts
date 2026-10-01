import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE TRUSTED-PUBLISHER APPLICATION HARNESS (report 6d076258, ledger 0360).
 * Dev only: 404 in production, no auth, no Supabase. It mounts the REAL
 * student form in each of its states and the REAL admin panels (applications,
 * the question editor, the trusted roster) with in-memory transports, in the
 * room and inside `FoundryPage`, the way the two routes mount them.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
