import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { JwtPayload } from '@supabase/supabase-js';
import type { PageLoad } from './$types';
import { makeStubSupabase, profileForMode, type TourHarnessMode } from './store.svelte';

/**
 * Dev-only harness for the first-time spotlight tour: mounts the REAL home
 * page with a mock session so auto-launch, spotlight positioning, keyboard
 * nav, and skip / replay behavior can be browser-verified with no auth or
 * Supabase. 404s in a production build.
 *
 * Modes (?mode=, full-reload links in the floating panel):
 *   anon    - signed out, no local seen-flag: phase A (sign-in step) auto-launches
 *   student - signed-in first-timer (tour_completed_at null): phase B auto-launches
 *   done    - tour already completed: no auto-launch, header replay only
 *   picker  - student with no pathway: the pathway picker owns the screen first,
 *             the tour waits for it
 */
export const ssr = false;
export const prerender = false;

const MODES: TourHarnessMode[] = ['anon', 'student', 'done', 'picker'];

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const raw = url.searchParams.get('mode') as TourHarnessMode | null;
	const mode: TourHarnessMode = raw && MODES.includes(raw) ? raw : 'student';
	const profile = profileForMode(mode);
	// Shaped like a validated Supabase JWT so the mock satisfies the home
	// page's PageData; only `sub` and `email` are actually read.
	const claims: JwtPayload | null = profile
		? ({
				iss: 'dev-harness',
				sub: profile.id,
				aud: 'authenticated',
				exp: 4102444800,
				iat: 1751328000,
				role: 'authenticated',
				aal: 'aal1',
				session_id: 'dev-harness',
				email: profile.email ?? '',
				phone: '',
				is_anonymous: false
			} as JwtPayload)
		: null;
	return {
		mode,
		claims,
		userProfile: profile,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		supabase: makeStubSupabase() as any,
		gauntletNudge: null,
		fspOpened: [] as string[]
	};
};
