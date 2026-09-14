/**
 * THE IDEACAD CHOOSER WITH NOTHING STARTED YET. Ledger 0264, item 4.
 *
 * A SEPARATE SPEC RATHER THAN A `prepare` STEP ON THE POPULATED ONE, because
 * the empty state is a different ARRANGEMENT and not a narrowing of the same
 * one: the starters become the primary action in place of a documents section,
 * and the heading changes with them. A route driven into the state under test
 * is one this harness can silently measure in the wrong state.
 *
 * WHAT IT PROVES THAT THE RENDER TEST CANNOT: that the primary action is
 * reachable at a real width -- present, visible, over 44px and hit-testing to
 * itself -- rather than merely in the markup. See the sibling spec's header for
 * the path, the 44px floor and why an inert client is enough.
 */
export default {
	path: '/ideacad/preview/chooser/empty',
	label: 'IdeaCAD: the chooser with nothing started yet',
	presence: [
		{ selector: '[data-testid="ideacad-app"]', label: 'the app shell', expectPresent: 1, expectVisible: 1 },
		/* THE EMPTY STATE'S PRIMARY ACTION IS THE STARTERS THEMSELVES, composed
		   in place. Two of them, and the first carries the lead treatment. */
		{ selector: '.new-grid .doc-open', label: 'the starters, as the primary action', expectPresent: 2, expectVisible: 2 },
		{ selector: '.new-grid .doc-open.primary', label: 'the lead starter', expectPresent: 1, expectVisible: 1 },
		/* Nothing started means no documents section, no cards and no controls.
		   Every one of these is an absence with the starters above as the
		   positive control that the page rendered. */
		{ selector: '.doc', label: 'document cards, none', expectPresent: 0 },
		{ selector: 'input[type="search"]', label: 'the search box, absent with nothing to search', expectPresent: 0 },
		{ selector: '.filters button', label: 'the filter tabs, absent with nothing to filter', expectPresent: 0 },
		{ selector: '.narrowed', label: 'the nothing-matches note, which is NOT the empty-account state', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.start-heading h1', label: 'the empty-state heading', min: 4.5 },
		{ selector: '.start-heading > p:last-child', label: 'the sentence saying what a document is', min: 4.5 },
		{ selector: '.new-grid .card-code', label: 'the NEW DOCUMENT code line', min: 4.5, all: true },
		{ selector: '.new-grid .doc-body strong', label: 'a starter’s name', min: 4.5, all: true },
		{ selector: '.new-grid .meta', label: 'the Create and open line', min: 4.5, all: true }
	],
	tapTargets: [{ selector: '.new-grid .doc-open', label: 'a starter, the primary action' }],
	textContains: [
		{
			selector: '.start-card',
			label: 'the empty state leads with New document and explains what one is',
			must: ['Start your first document', 'NEW DOCUMENT', 'Create and open'],
			mustNot: ['Rename', 'Duplicate', 'Delete']
		}
	]
};
