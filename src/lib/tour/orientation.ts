/**
 * The first-time portal orientation tour: step content for the homepage
 * walkthrough (PLAIN DATA, client-safe). Two phases in one continuous flow:
 *
 *   'signin' (pre-auth):  one step on the header's Google sign-in control.
 *   'home'   (post-auth): a short walk through the home screen, closing with
 *                         the VANGUARD, GAUNTLET, and IDEA Coin entry points.
 *
 * HomeTour.svelte decides which phase auto-launches (anonymous visitors get
 * 'signin', a signed-in first-timer gets 'home'); the manual "Take the tour"
 * header control replays everything, and the engine drops any step whose
 * target is not on the page (so the sign-in step vanishes once signed in).
 * Targets are stable data-tour attributes, never style classes.
 */

import type { TourStep } from './tour';

export type TourPhase = 'signin' | 'home';

export interface OrientationStep extends TourStep {
	phase: TourPhase;
}

/**
 * localStorage flag: the anonymous pre-auth tour was completed or dismissed on
 * this browser, so it never auto-opens again. The authoritative flag for
 * signed-in users is profiles.tour_completed_at (0045); this local one only
 * stops the pre-auth step from nagging before an account exists.
 */
export const TOUR_SEEN_KEY = 'idea_tour_seen';

export const ORIENTATION_STEPS: OrientationStep[] = [
	{
		phase: 'signin',
		target: '[data-tour="signin"]',
		title: 'Sign in with Google',
		body: 'Use your Bosco Tech Google account, the same one you use for school. Signing in unlocks cloud saves, your class, and your progress.'
	},
	{
		phase: 'home',
		target: '[data-tour="hero"]',
		title: 'Welcome to IDEA',
		body: 'This is the IDEA portal, home base for courses, games, and team tools. Everything starts on this page.'
	},
	{
		phase: 'home',
		target: '[data-tour="apps"]',
		title: 'Apps',
		body: 'Every portal app lives in the grid below, grouped by Games, Tools, and Class. Sign in to pin favorites and reorder them with Customize.'
	},
	{
		phase: 'home',
		target: '[data-tour="your-class"]',
		title: 'Courses and assignments',
		body: 'The 2026-27 curriculum and every open assignment live in this section. Pick your class once and it pins to the top.'
	},
	{
		phase: 'home',
		target: '[data-tour="vanguard"]',
		title: 'IDEA // VANGUARD',
		body: 'The arcade shooter. Clear sectors, chain combos, and chase the leaderboard.'
	},
	{
		phase: 'home',
		target: '[data-tour="gauntlet"]',
		title: 'IDEA // GAUNTLET',
		body: 'The CAD skills dojo. Train SolidWorks against the clock and climb the boards.'
	},
	{
		phase: 'home',
		target: '[data-tour="coins"]',
		title: 'IDEA Coin Ledger',
		body: 'Live coin balances, transactions, and rankings across all sections.'
	}
];
