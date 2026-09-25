/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { choose, FIGURES, SLUGS } from './foundry-boards.mjs';

/**
 * MOST HOURS: THE FIGURE ON A CARD IS THE ORDER'S OWN METRIC.
 *
 * THE DEFECT THIS PINS, fixed on the way past by decision 39's rewrite: the
 * list printed each app's PLAY count under Most hours, so Orbit Lab led the
 * list reading "40 plays" above apps with twice as many -- a ranking whose
 * numbers do not explain its order, and entirely plausible on screen. The
 * figures are read back as words and `mustNot` a play count.
 */
export default {
	path: '/dev/foundry-boards?state=hours',
	aliasOf: '/dev/foundry-boards',
	label: 'Foundry gallery: Most hours chosen, figures are durations',
	prepare: [
		choose(
			'hours',
			`() => document.querySelector('.fdy-gal-mosaic [data-testid="fdy-card"]')?.getAttribute('data-app-slug') === 'orbit-lab'`
		)
	],
	presence: [
		{
			selector: '.fdy-gal-mosaic [data-testid="fdy-card-plays"]',
			label: 'a duration on the eight apps with any time, never on the zero',
			expectPresent: 8,
			maxPresent: 8,
			expectVisible: 8
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
			selector: '.fdy-gal-mosaic [data-testid="fdy-card-plays"]',
			label: 'no card under Most hours prints a play count',
			must: ['4h 10m'],
			mustNot: ['plays', 'play ']
		}
	],
	orderResult: [
		{
			label: 'the one list is ranked by time played',
			evaluate: SLUGS,
			expected: ['orbit-lab', 'cookie-press', 'maze-maker', 'tide-pool', 'sprout-sim', 'frog-frenzy', 'pixel-forge', 'bolt-run', 'quiet-quest']
		},
		{
			label: 'each figure is a duration in the words a person uses',
			evaluate: FIGURES,
			expected: ['4h 10m', '2h 30m', '1h 10m', '40m', '30m', '15m', '10m', '5m']
		}
	],
	contrast: [],
	tapTargets: []
};
