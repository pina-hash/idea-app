/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { choose, FIGURES, SLUGS } from './foundry-boards.mjs';

/**
 * TRENDING, CHOSEN FROM THE ONE CONTROL (decision 39).
 *
 * Trending was a board-only order until decision 39 and `isGallerySort`
 * refused it; it is an option now, and choosing it must reorder the ONE list
 * by the rise and put the rise on each card. A select that listed "Trending"
 * and ranked by something else would look entirely correct, which is why the
 * order and the figures are read back rather than the option's presence.
 *
 * Cookie Press is the most played app in the fixture BY FAR and is falling,
 * so it is LAST here -- if Trending quietly became "plays this week" it would
 * lead instead.
 */
export default {
	path: '/dev/foundry-boards?state=trending',
	aliasOf: '/dev/foundry-boards',
	label: 'Foundry gallery: Trending chosen from the sort control',
	prepare: [
		choose(
			'trending',
			`() => document.querySelector('.fdy-gal-mosaic [data-testid="fdy-card"]')?.getAttribute('data-app-slug') === 'sprout-sim'`
		)
	],
	presence: [
		/* FOUR APPS ROSE; the rest print nothing, never a zero or a minus. */
		{
			selector: '.fdy-gal-mosaic [data-testid="fdy-card-plays"]',
			label: 'a rise on the four apps that rose, and nothing on the rest',
			expectPresent: 4,
			maxPresent: 4,
			expectVisible: 4
		},
		{
			selector: '[data-testid="foundry-play-coverage"]',
			label: 'the coverage note stays beside a play order',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	],
	textContains: [
		{
			selector: '[data-testid="foundry-sort-note"]',
			label: 'Trending says what it counts',
			must: ['Played more this week than the week before.'],
			mustNot: ['Nothing is climbing']
		}
	],
	orderResult: [
		{
			label: 'the one list is ranked by the rise, the falling most-played app last',
			evaluate: SLUGS,
			expected: ['sprout-sim', 'frog-frenzy', 'bolt-run', 'orbit-lab', 'tide-pool', 'quiet-quest', 'maze-maker', 'pixel-forge', 'cookie-press']
		},
		{
			label: 'each figure is the rise, never a play count',
			evaluate: FIGURES,
			expected: ['+8 this week', '+7 this week', '+2 this week', '+1 this week']
		}
	],
	contrast: [],
	tapTargets: []
};
