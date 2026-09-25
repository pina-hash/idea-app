/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * SEARCH, THE RUNG THAT ANSWERS REPORT 32b's OWN EXAMPLE.
 *
 * He wrote: "if I search for Cookie Clicker but the game's actually called
 * Cookie Press, the words don't match but that's what they're looking for."
 * The query here is `Cookei Clicker`, which is that example with a typo in it,
 * and it exercises BOTH rungs above direct matching at once:
 *
 *   "cookei"   is one edit from "cookie" -- the spelling-tolerance rung.
 *   "clicker"  matches nothing in this gallery at all.
 *
 * So the app can only be found if a query token may match on its own AND a
 * four-letter-or-longer token tolerates one edit. Requiring every token to
 * match -- the usual default -- returns nothing here, which is exactly the
 * search he reported as broken.
 *
 * THE FIXTURE IS WHAT MAKES THIS A REAL TEST. `Cookie Press` is in
 * `/dev/foundry-boards`'s own seed data with that description and that author;
 * nothing about this spec plants it.
 */
const type = (q) => ({
	evaluate: `() => { const el = document.querySelector('[data-testid="foundry-gallery-search"]'); if (!el) return 'NO SEARCH BOX'; el.value = ${JSON.stringify(q)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed: ' + el.value; }`,
	until: `() => document.querySelectorAll('[data-testid="foundry-gallery-sort"]').length === 0`
});

export default {
	path: '/dev/foundry-boards?state=search-loose',
	aliasOf: '/dev/foundry-boards',
	label: 'Foundry search: a misspelt word plus a word that matches nothing',
	prepare: [
		type('Cookei Clicker'),
		/*
			THE RESULT IS READ BACK AS A STRING so the report prints WHICH app was
			found rather than only that one was. A count of 1 would pass just as
			happily on a scorer that returned the wrong app.

			IT READS THE HREF AND NOT THE RENDERED TITLE, which the first draft
			did and which came back `(none)` on a passing run. A card with a
			GENERATED cover renders its name plate only when there is a count to
			put on it, and there is no count under a search -- the list is ranked
			by relevance then, so a play figure would be a number that does not
			explain the order it sits in. So the title is genuinely not in the
			DOM here and the slug in the link is the identity that always is.
		*/
		{
			evaluate: `() => { const a = document.querySelector('[data-testid="foundry-gallery-grid"] > li a[href*="app="]'); return 'top result: ' + (a ? a.getAttribute('href') : '(none)'); }`,
			until: `() => !!document.querySelector('[data-testid="foundry-gallery-grid"] > li a[href*="app=cookie-press"]')`
		}
	],
	presence: [
		{
			selector: '[data-testid="foundry-gallery-grid"] > li',
			label: 'at least the misspelt app is found',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="foundry-search-empty"]',
			label: 'the empty state is NOT what a tolerant match produces',
			expectPresent: 0,
			maxPresent: 0
		}
	],
	contrast: [],
	tapTargets: []
};
