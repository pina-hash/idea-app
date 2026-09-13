/**
 * NOBODY HAS SHARED ANYTHING, which is decision 24's default and therefore the
 * state almost every student sees on almost every assignment.
 *
 * IT IS THE STATE THE PLACEMENT DECISION RESTS ON. The panel sits BELOW the
 * editor rather than above it precisely because this is the normal case: a
 * permanently empty panel above a student's own work spends vertical space at
 * 375 to say nothing. So the measurement that matters here is what the empty
 * panel costs and that it renders no count.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-item?state=empty',
	label: 'IdeaCAD item page: nothing shared, which is the normal state',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadItemStore === "function"' },
		{ waitFor: '() => window.__ideacadItemStore().documentId !== null' },
		/* A REPORTED FIGURE, NOT A THRESHOLD, which is what a `prepare` evaluate
		   step is for -- `orderResult` compares arrays element for element and
		   refuses anything else, so a number with no right answer does not belong
		   there. The claim the placement decision rests on is that this box reads
		   BELOW the editor, which `domOrder` asserts; the height is printed so a
		   later session can see what moving it above would cost a student at
		   375. */
		{
			evaluate:
				'() => { const el = document.querySelector(\'[data-testid="ideacad-shared"]\'); return el ? "the empty panel is " + Math.round(el.getBoundingClientRect().height) + "px tall" : "no panel"; }'
		}
	],
	orderResult: [
		{
			label: 'the student is on their own document and the panel is quiet',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["rows " + c.rows, "empty " + c.empty, "unavailable " + c.unavailable, "banner " + c.banner, "editors " + c.editors]; }',
			// `empty 1, unavailable 0` is the whole distinction: "nothing is shared
			// with you" and "this site cannot tell" are different absences and must
			// never render as each other.
			expected: ['rows 0', 'empty 1', 'unavailable 0', 'banner 0', 'editors 1']
		},
		{
			label: 'nothing overflows',
			evaluate: '() => window.__ideacadItemVerdicts()',
			expected: [
				'nothing is wider than the window ok',
				'the engine host is on screen ok',
				'the shared panel sits inside the engine host ok',
				'no control in the shared panel is wider than half its panel ok',
				'every control sits inside the panel that owns it ok',
				'every row sits inside the panel ok',
				'no row carries both an Open control and the Open-now mark ok'
			]
		}
	],
	domOrder: [
		{
			before: '[data-testid="ideacad-editor"]',
			after: '[data-testid="ideacad-shared"]',
			label: 'the empty panel reads below the student\'s own work'
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-shared-empty"]', label: 'the empty sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-summary"]', label: 'a count, which an empty list must NOT render', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-unavailable"]', label: 'the ladder sentence, which is a different absence', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-editor"]', label: 'the editor is mounted, which is the control for the zeroes above', expectPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-shared-empty"]',
			label: 'it says private-by-default rather than reporting a shortage',
			must: ['private until you share it'],
			mustNot: ['0 documents']
		}
	],
	contrast: [{ selector: '[data-testid="ideacad-shared-empty"]', label: 'the empty sentence', min: 4.5 }],
	tapTargets: [],
	ignoreConsole: [
		/* THE FIXTURE'S OWN ATTACHMENT, not this surface's. The split fixture's
		   published assignment carries an attachment row, and `/api/classroom/
		   attachment/a-2` answers 401 with no session -- which is correct
		   behaviour from a route that is not what this spec measures. The same
		   two patterns are on every `classroom-inspector-*` spec for the same
		   reason. */
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
