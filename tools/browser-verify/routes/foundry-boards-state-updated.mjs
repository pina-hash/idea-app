/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { choose, FIGURES, SLUGS } from './foundry-boards.mjs';

/**
 * MOST UPDATED: AN ORDER THAT DOES NOT RANK ON PLAYS, SO THE COVERAGE NOTE
 * STEPS AWAY.
 *
 * `FOUNDRY_PLAY_COVERAGE_NOTE` says play figures undercount. Under an order
 * whose figures are version counts it would be a sentence about a number the
 * page is not showing, so it renders only while the order `ranksPlays`. This
 * is the ABSENCE half; its positive control is `routes/foundry-boards.mjs`,
 * the same route under Most played, where it is 1.
 *
 * Ties keep the incoming order (`recent`), which the expected list below
 * shows twice: Sprout Sim before Quiet Quest on 2, Frog Frenzy before Bolt Run
 * on 1.
 */
export default {
	path: '/dev/foundry-boards?state=updated',
	aliasOf: '/dev/foundry-boards',
	label: 'Foundry gallery: Most updated chosen, no play note',
	prepare: [
		choose(
			'versions',
			`() => document.querySelector('.fdy-gal-mosaic [data-testid="fdy-card"]')?.getAttribute('data-app-slug') === 'maze-maker'`
		)
	],
	presence: [
		{
			selector: '[data-testid="foundry-play-coverage"]',
			label: 'no play coverage note under an order that ranks no plays',
			expectPresent: 0,
			maxPresent: 0
		},
		{
			selector: '[data-testid="foundry-sort-note"]',
			label: 'the order still says what it counts',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	],
	textContains: [
		{
			selector: '[data-testid="foundry-sort-note"]',
			label: 'Most updated says what it counts',
			must: ['How many versions the author has uploaded.']
		}
	],
	orderResult: [
		{
			label: 'the one list is ranked by version count, ties in updated order',
			evaluate: SLUGS,
			expected: ['maze-maker', 'orbit-lab', 'pixel-forge', 'cookie-press', 'tide-pool', 'sprout-sim', 'quiet-quest', 'frog-frenzy', 'bolt-run']
		},
		{
			label: 'each figure is a version count',
			evaluate: FIGURES,
			expected: ['11 versions', '6 versions', '5 versions', '4 versions', '3 versions', '2 versions', '2 versions', '1 version', '1 version']
		}
	],
	contrast: [],
	tapTargets: []
};
