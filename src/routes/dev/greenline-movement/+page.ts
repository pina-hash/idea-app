import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * GREENLINE movement prototype harness. Dev-only: it 404s in a production
 * build so it never ships. No login or Supabase; it exists purely to validate
 * vehicle driving feel (acceleration, steering, drift) in a browser before any
 * track, combat, or art gets built. Throwaway and iterative by design.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
