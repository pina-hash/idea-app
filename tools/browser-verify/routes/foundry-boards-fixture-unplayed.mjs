/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { choose, FIGURES, SLUGS } from './foundry-boards.mjs';

/**
 * A GALLERY NOBODY HAS PLAYED: AN ORDER WITH NOTHING TO RANK SAYS SO.
 *
 * The ranked sections hid themselves when their signal was flat; one list
 * cannot hide, so the sentence beside the control changes instead. On this
 * fixture -- the same nine apps with every play figure at zero, which is the
 * state a new gallery is in -- Most played is every app tied, and a list that
 * silently looked ranked would imply an order nobody earned.
 *
 * IT IS ITS OWN PATH, NOT AN ALIAS. `?fixture=unplayed` is read by the
 * harness's load and changes the counts, so the URL visited has to carry it.
 *
 * THE FIRST STEP READS THE DEFAULT ORDER'S SENTENCE, THE SECOND CHOOSES
 * TRENDING. Both are measurements; the presence and text rows below are the
 * Trending state the second step lands in.
 */
export default {
	path: '/dev/foundry-boards?fixture=unplayed',
	label: 'Foundry gallery: nothing played yet, the control says so',
	prepare: [
		{
			evaluate: `() => 'Most played says: ' + document.querySelector('[data-testid="foundry-sort-note"]').textContent.trim()`,
			until: `() => document.querySelector('[data-testid="foundry-sort-note"]')?.textContent.includes('Nothing has been played here yet')`
		},
		choose(
			'trending',
			`() => document.querySelector('[data-testid="foundry-sort-note"]')?.textContent.includes('Nothing is climbing this week')`
		)
	],
	presence: [
		{
			selector: '.fdy-gal-mosaic [data-testid="fdy-card-plays"]',
			label: 'no figures on a gallery nobody has played',
			expectPresent: 0,
			maxPresent: 0
		},
		/* ZERO INCLUDED: a zero is exactly when a count is misread as "nobody
		   opened it", which is what the note is for. */
		{
			selector: '[data-testid="foundry-play-coverage"]',
			label: 'the coverage note is still beside the control at zero',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="foundry-gallery-grid"] > li',
			label: 'every app is still listed',
			expectPresent: 9,
			maxPresent: 9
		}
	],
	textContains: [
		{
			selector: '[data-testid="foundry-sort-note"]',
			label: 'Trending says nothing is climbing rather than stating its rule',
			must: ['Nothing is climbing this week'],
			mustNot: ['The number is the rise.']
		}
	],
	orderResult: [
		{
			label: 'with nothing to rank the list stays in the order it arrived (recently updated)',
			evaluate: SLUGS,
			expected: ['frog-frenzy', 'bolt-run', 'sprout-sim', 'pixel-forge', 'tide-pool', 'quiet-quest', 'cookie-press', 'orbit-lab', 'maze-maker']
		},
		{ label: 'no card carries a figure', evaluate: FIGURES, expected: [] }
	],
	contrast: [{ selector: '[data-testid="foundry-sort-note"]', label: 'the flat sentence', min: 4.5 }],
	tapTargets: []
};
