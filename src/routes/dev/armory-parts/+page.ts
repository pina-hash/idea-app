import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE ARMORY PART NUMBERS HARNESS (ledger 0405). Dev only: 404 in
 * production, no auth, no Supabase. The REAL ArmoryProjectParts and
 * ArmoryCotsLibrary in the real ArmoryFrame over in-memory transports, every
 * state stacked under `[data-view]`, or one with `?state=<name>`.
 */
export const prerender = false;

export const load = ({ url }) => {
	if (!dev) error(404, 'Not found');
	return { only: url.searchParams.get('state') };
};
