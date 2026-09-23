/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * SEARCH, RUNG ONE: the query IS the app's name.
 *
 * The precise case has to be precise, every time, even on a gallery where a
 * dozen apps share one of the words -- so this is the state that would catch a
 * scorer whose phrase bonus stopped outranking an accumulation of single
 * tokens.
 *
 * IT ALSO MEASURES WHAT SEARCHING TAKES AWAY. Typing replaces the ranked
 * sections and hides the sort control, because a person who has typed
 * something is looking for one app and four ranked rows above their results
 * are four things in the way of it. Those two absences are asserted here with
 * the same weight as the result itself: the boards are `expectPresent: 0`
 * against a run on the same route where they are 4.
 */

/**
 * TYPING, AS AN `evaluate` STEP. The runner has `click` and `evaluate` and no
 * `fill`, and Svelte's `bind:value` listens for an `input` event -- so setting
 * `.value` and dispatching one is exactly what a keystroke does. It RETURNS the
 * query so the report prints what was typed rather than only that a step ran.
 */
const type = (q) => ({
	evaluate: `() => { const el = document.querySelector('[data-testid="foundry-gallery-search"]'); if (!el) return 'NO SEARCH BOX'; el.value = ${JSON.stringify(q)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed: ' + el.value; }`,
	until: `() => document.querySelectorAll('[data-testid="foundry-gallery-boards"]').length === 0`
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
		/* THE TWO ABSENCES. Both are 4 and 5 respectively on the unsearched run
		   of this same route, which is the positive control that makes these
		   mean something. */
		{
			selector: '[data-testid="foundry-gallery-boards"]',
			label: 'ranked sections are replaced by results, not stacked above them',
			expectPresent: 0,
			maxPresent: 0
		},
		{
			selector: '.fdy-gal-sort-btn',
			label: 'the sort control steps out of the way while searching',
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
