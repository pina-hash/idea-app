import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * THE EXAM RUNTIME HARNESS (ledger 0391, surface e). Dev only: 404 in
 * production, no auth, no Supabase, no network. The REAL `ExamRunner` and the
 * REAL `ProctorLive` over in-memory transports and a five-question fake draw.
 *
 * `?state=lobby|question|failed|passed|expired|live` shows one state in its
 * own frame (and lets Begin exam ask for real full screen); no query stacks
 * every state under `[data-view]` for `tools/browser-verify/routes/cert-exam.mjs`.
 * `?pollMs=` sets the live view's poll so a harness can count the reads;
 * `?theme=space-white|matrix` forces the site theme the way /dev/armory does.
 */
export const prerender = false;

const STATES = new Set(['lobby', 'question', 'failed', 'passed', 'expired', 'live']);

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const state = url.searchParams.get('state');
	const pollMs = Number(url.searchParams.get('pollMs'));
	return {
		only: state && STATES.has(state) ? state : null,
		pollMs: Number.isFinite(pollMs) && pollMs >= 200 ? pollMs : 5000
	};
};
