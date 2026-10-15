import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * THE WATCH TRACKER HARNESS (ledger 0391, surface e). Dev only: 404 in
 * production, no auth, no Supabase. The REAL `YouTubePlayer`, twice over:
 * once with no factory (the API script is what the browser-verify harness
 * blocks, so this instance measures the "did not load" state), and over the
 * `FakePlayer` for the coverage bar, the Continue check-in, a missed check-in
 * and the 2x cap, which no real video could be driven to in a spec.
 *
 * `?state=real|fake|checkin|missed` shows one; no query stacks all four under
 * `[data-view]` for `tools/browser-verify/routes/cert-watch.mjs`.
 */
export const prerender = false;

const STATES = new Set(['real', 'fake', 'checkin', 'missed']);

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const state = url.searchParams.get('state');
	return { only: state && STATES.has(state) ? state : null };
};
