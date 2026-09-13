/**
 * NOTHING SHARED, AND NO 0205 -- two absences that must not render the same way.
 *
 * Private by default is decision 24's premise, so an empty list is the DEFAULT
 * state rather than a deficiency: no placeholder, no "0 documents", one quiet
 * sentence. A deployment with no `0205` could not ASK the question, and
 * reporting that as "nobody has shared anything with you" is a confident answer
 * to a question nobody asked -- "cannot tell" must never render as an answer.
 *
 * BOTH STATES IN ONE ROUTE, because the finding is the DIFFERENCE between them
 * and two routes would report two passes without ever comparing the sentences.
 * The route drives `state=empty` and reads the other page's sentence from the
 * module, so a restyle that made the two identical reddens here.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-shared?state=empty',
	label: 'IdeaCAD shared: nothing shared renders no placeholder, and is not the ladder sentence',
	widths: WIDTHS,
	prepare: [{ waitFor: '() => typeof window.__ideacadSharedControls === "function"' }],
	orderResult: [
		{
			label: 'no rows, no summary, one sentence',
			evaluate:
				'() => { const c = window.__ideacadSharedControls(); return ["rows " + c.rows, "empty " + c.empty, "unavailable " + c.unavailable, "open " + c.open]; }',
			expected: ['rows 0', 'empty 1', 'unavailable 0', 'open 0']
		},
		{
			label: 'the panel still has a heading and a box, so an empty list is not a blank area',
			evaluate: '() => window.__ideacadSharedVerdicts()',
			expected: [
				'the shared list is on screen ok',
				'nothing is wider than the window ok',
				'every control sits inside the panel that owns it ok',
				'every row sits inside the panel ok',
				'no row carries both an Open control and the Open-now mark ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-shared-empty"]', label: 'the empty sentence', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'a row', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-summary"]', label: 'the summary chip, which must not read "0 documents"', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-unavailable"]', label: 'the LADDER sentence, which this state must not borrow', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-shared"]',
			label: 'it says the normal thing, not the cannot-ask thing',
			must: ['Shared with you', 'Nobody has shared a document with you', 'private until you share it'],
			// The ladder's own distinguishing phrase. If it appeared here the two
			// states would be indistinguishable to a student.
			mustNot: ['not switched on for this site yet', '0 documents', 'undefined']
		}
	],
	contrast: [{ selector: '[data-testid="ideacad-shared-empty"]', label: 'the empty sentence', min: 4.5 }],
	tapTargets: []
};
