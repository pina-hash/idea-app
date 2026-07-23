import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Dev HARNESS for the GREENLINE track builder: plain dev-only 404 guard, like
 * every other /dev harness (no auth, no Supabase).
 *
 * The teacher-only production guard that used to live here is RETIRED (Bundle
 * 4a): the builder's real home is /greenline/builder, open to any signed-in
 * user via the standard /greenline authed prefix, and linked from the
 * GREENLINE title screen. This route stays as the regression harness — it
 * mounts the same TrackBuilder with an in-memory publish fake that runs the
 * REAL validatePublishTrack, so the publish flow (including server-side
 * rejection copy) is drivable without auth.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
