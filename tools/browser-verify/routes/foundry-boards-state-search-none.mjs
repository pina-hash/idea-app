/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * SEARCH, THE EMPTY STATE, WHICH IS NOT THE GALLERY'S EMPTY STATE.
 *
 * "Nothing has been published yet" would be a lie on a gallery of nine apps,
 * and it is what a single shared empty branch would have produced. The sentence
 * here names what was searched and says that an unapproved app is not on the
 * gallery -- so a student does not conclude their own app has vanished.
 *
 * THE CLEAR CONTROL IS PART OF THE STATE. A person looking at no results needs
 * a way back that is not deleting nine characters one at a time, and it is a
 * student-facing control, so it clears 44px.
 *
 * `xylophone` IS NOT IN THE FIXTURE, in any title, tagline, description, slug
 * or author name, and no token of it is within one edit of a word that is.
 */
export default {
	path: '/dev/foundry-boards?state=search-none',
	aliasOf: '/dev/foundry-boards',
	label: 'Foundry search: a query that matches nothing',
	prepare: [
		{
			evaluate: `() => { const el = document.querySelector('[data-testid="foundry-gallery-search"]'); if (!el) return 'NO SEARCH BOX'; el.value = 'xylophone'; el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed: ' + el.value; }`,
			until: `() => !!document.querySelector('[data-testid="foundry-search-empty"]')`
		}
	],
	presence: [
		{
			selector: '[data-testid="foundry-search-empty"]',
			label: 'the search empty state, visible',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="foundry-gallery-grid"] > li',
			label: 'no cards at all',
			expectPresent: 0,
			maxPresent: 0
		},
		{
			selector: '[data-testid="foundry-search-empty"] button',
			label: 'a way back out of a search that found nothing',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="foundry-search-count"]',
			label: 'the count still says how many, which is zero',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	contrast: [
		{ selector: '[data-testid="foundry-search-empty"] p', label: 'the empty-state sentence', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="foundry-search-empty"] button', label: 'clear the search', min: 44 }
	]
};
