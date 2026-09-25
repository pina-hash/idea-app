/**
 * DUPLICATES LEFT THE TAB BAR, AND ITS DOOR IS BESIDE DRAFTS (ledger 0298,
 * report 28: "I don't think I'm going to ever use it very often ... put
 * somewhere out of the way"). A teacher on the class page of a class whose one
 * draft has two more copies (`?dupes=2`): the tab bar holds five tabs and no
 * Duplicates; beside the Drafts filter a quiet link says "2 duplicate drafts"
 * and goes to the class's duplicates page.
 *
 * The count comes through the class page's injected `loadDuplicateCount`, the
 * same seam the real section layout fills with 0187's own function; here it
 * is the harness's in-memory stand-in. The negative controls are the two specs
 * beside this one: the same teacher with ONE draft (nothing to act on, so no
 * door, with the Drafts chip as the positive control), and a student with the
 * copies seeded (a student is never handed a draft or a door).
 */
import { TOUR_READY } from './_classroom-tour.mjs';

const DOOR = '[data-testid="stream-duplicates-door"]';

export default {
	path: '/dev/classroom-tour/s-1?manage=1&tour=offered&dupes=2',
	label: 'Duplicates door beside Drafts when the class has duplicate drafts, and no Duplicates tab',
	prepare: [TOUR_READY, { waitFor: `() => !!document.querySelector('${DOOR}')`, timeoutMs: 5000 }],
	presence: [
		{ selector: DOOR, label: 'the Duplicates door', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stream-status-drafts"]', label: 'the Drafts filter it sits beside', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="section-tab-duplicates"]', label: 'no Duplicates tab', expectPresent: 0 },
		{ selector: 'a[data-testid^="section-tab-"]', label: 'five tabs', expectPresent: 5, maxPresent: 5, expectVisible: 5 }
	],
	textContains: [{ selector: DOOR, label: 'the count and its noun', must: ['2 duplicate drafts'] }],
	contrast: [{ selector: DOOR, label: 'the Duplicates door', min: 4.5 }],
	tapTargets: [{ selector: DOOR, label: 'the Duplicates door', min: 44 }],
	orderResult: [
		{
			label: 'the door names the duplicates page, sits in the filter row after Drafts, and answers a tap at its centre',
			evaluate: `() => {
				const d = document.querySelector('${DOOR}');
				const drafts = document.querySelector('[data-testid="stream-status-drafts"]');
				const row = document.querySelector('[data-testid="stream-find"]');
				const r = d.getBoundingClientRect();
				const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				const after = !!(drafts.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
				return [
					new URL(d.href).pathname,
					row.contains(d) && after ? 'after Drafts, in the filter row' : 'NOT BESIDE DRAFTS',
					hit && d.contains(hit) ? 'answers at its centre' : 'COVERED'
				];
			}`,
			expected: ['/dev/classroom-tour/s-1/duplicates', 'after Drafts, in the filter row', 'answers at its centre']
		}
	]
};
