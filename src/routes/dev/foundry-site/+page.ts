import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE WHOLE-FOUNDRY SWITCH HARNESS (report c26026b0, ledger 0360). Dev only:
 * 404 in production, no auth, no Supabase. The REAL off panel a student reads,
 * the REAL banner an administrator reads, and the REAL switch, on and off,
 * with an in-memory transport.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
