import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { makeStubSupabase, store } from './store';

/**
 * Dev-only harness for the Bosco Tech pathway identity system: the PathwayChip
 * across all six pathways, the name tint, and the REAL first-login
 * PathwayPicker (mounted by the root layout, exactly as in production, because
 * this mock profile is a student with no pathway). 404s in a production build;
 * no auth or Supabase (the stub client persists the choice to an in-memory
 * profile that survives invalidateAll()).
 */
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {
		claims: { sub: store.profile.id, email: store.profile.email },
		userProfile: { ...store.profile },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		supabase: makeStubSupabase() as any
	};
};
