import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Dev HARNESS for the GREENLINE piece-chain builder (schema v3 authoring).
 * Plain dev-only 404 guard, like every other /dev harness: no auth, no
 * Supabase, no network. Distinct from /dev/greenline-track-builder, which is
 * the RIBBON builder's harness — the two author different surface kinds.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
