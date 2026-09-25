/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * SEARCH, RUNG ONE: the query IS the app's name.
 *
 * The precise case has to be precise, every time, even on a gallery where a
 * dozen apps share one of the words -- so this is the state that would catch a
 * scorer whose phrase bonus stopped outranking an accumulation of single
 * tokens.
 *
 * IT ALSO MEASURES WHAT SEARCHING TAKES AWAY. Typing hides the sort control
 * and the sentences beside it, because a person who has typed something is
 * looking for one app and the results are ranked by relevance, not by the
 * order the control names. Those absences are asserted here with the same
 * weight as the result itself: the control is `expectPresent: 0` against a
 * run on the same route (`routes/foundry-boards.mjs`) where it is 1. (Until
 * decision 39 typing also replaced four ranked sections; they are gone.)
 */

/**
 * TYPING, AS AN `evaluate` STEP. The runner has `click` and `evaluate` and no
 * `fill`, and Svelte's `bind:value` listens for an `input` event -- so setting
 * `.value` and dispatching one is exactly what a keystroke does. It RETURNS the
 * query so the report prints what was typed rather than only that a step ran.
 */
const type = (q) => ({
	evaluate: `() => { const el = document.querySelector('[data-testid="foundry-gallery-search"]'); if (!el) return 'NO SEARCH BOX'; el.value = ${JSON.stringify(q)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed: ' + el.value; }`,
	until: `() => document.querySelectorAll('[data-testid="foundry-gallery-sort"]').length === 0`
});

export default {
	path: '/dev/foundry-boards?state=search-exact',
	aliasOf: '/dev/foundry-boards',
	label: 'Foundry search: the query is the app’s own name',
	prepare: [type('Cookie Press')],
	presence: [
		{
			selector: '[data-testid="foundry-gallery-grid"] > li',
			label: 'exactly one result for an exact name',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="foundry-search-count"]',
			label: 'the live count of what was found',
			expectPresent: 1,
			expectVisible: 1
		},
		/* THE ABSENCES. Each is 1 on the unsearched run of this same route,
		   which is the positive control that makes these mean something. */
		{
			selector: '[data-testid="foundry-gallery-sort"]',
			label: 'the sort control steps out of the way while searching',
			expectPresent: 0,
			maxPresent: 0
		},
		{
			selector: '[data-testid="foundry-play-coverage"]',
			label: 'no play note while the cards carry no play figure',
			expectPresent: 0,
			maxPresent: 0
		},
		{
			selector: '[data-testid="foundry-search-empty"]',
			label: 'no empty state when something was found',
			expectPresent: 0,
			maxPresent: 0
		}
	],
	contrast: [{ selector: '[data-testid="foundry-search-count"]', label: 'result count', min: 4.5 }],
	tapTargets: []
};
