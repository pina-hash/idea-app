import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the shell's report affordance and the admin console.
 *
 * Mounts the REAL SiteFeedback (both placements), the REAL FeedbackBox behind
 * it and the REAL FeedbackConsole against one in-memory sink, so the whole
 * round trip -- open, capture, refuse, retry, land, triage, export -- is
 * drivable with no auth and no Supabase. 404s in production.
 *
 * `/dev/feedback/boom` next door throws from its load, which is how the root
 * error boundary is driven for real rather than described.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
