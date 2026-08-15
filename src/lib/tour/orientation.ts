/**
 * The first-time portal orientation tour: step content for the homepage
 * walkthrough (PLAIN DATA, client-safe). Two phases in one continuous flow:
 *
 *   'signin' (pre-auth):  one step on the header's Google sign-in control.
 *   'home'   (post-auth): a short walk through the home screen -- the hero, the
 *                         class feed, the app grid -- closing on four app cards
 *                         (Notebook, Coin Ledger, GAUNTLET, GREENLINE).
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
		// The one step that asks for a click, so it is the one step that lets the
		// reader through to the control it is pointing at.
		interactive: true,
		title: 'Sign in with Google',
		body: 'Use your Bosco Tech Google account, the same one you use for school. Signing in loads your classes, saves your work, and keeps your progress on every device. Go ahead and click it now.'
	},
	{
		phase: 'home',
		target: '[data-tour="hero"]',
		title: 'Welcome to IDEA',
		body: 'This is the IDEA portal. Classes, coursework, training, and games all live here, and everything you do is tied to your account.'
	},
	{
		phase: 'home',
		target: '[data-tour="classes"]',
		title: 'Your classes',
		body: 'Announcements, assignments, and due dates from your teachers. Open a class to see what is posted and what is due next.'
	},
	{
		phase: 'home',
		target: '[data-tour="apps"]',
		title: 'Apps',
		body: 'Everything else in one grid. Drag a card to move it, pin the ones you use most, or sort by what you have opened recently.'
	},
	{
		phase: 'home',
		target: '[data-tour="notebook"]',
		title: 'My Notebook',
		body: 'Photograph your engineering notebook pages and keep every entry in one place.'
	},
	{
		phase: 'home',
		target: '[data-tour="coins"]',
		title: 'IDEA Coin Ledger',
		body: 'Your balance, every transaction, the leaderboard, open contracts, and role applications.'
	},
	{
		phase: 'home',
		target: '[data-tour="gauntlet"]',
		title: 'IDEA // GAUNTLET',
		body: 'The CAD skills dojo. Timed modeling, drawing reading, and GD&T, with a leaderboard on every challenge.'
	},
	{
		phase: 'home',
		target: '[data-tour="greenline"]',
		title: 'IDEA // GREENLINE',
		body: 'Build a machine, take it to Proving Ground 07, and race it under the floodlights.'
	}
];
