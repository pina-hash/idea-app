import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * GREENLINE track builder (dev tool, stage 1). Dev-only: 404s in a production
 * build so it never ships. No login or Supabase; it authors tracks from
 * snap-together pieces and exports schema-v2 TrackData JSON for committing to
 * src/lib/greenline/tracks/.
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
