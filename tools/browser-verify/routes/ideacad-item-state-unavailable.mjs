/**
 * A DEPLOYMENT WITH NO `0205`, which is a real state because migrations here
 * are applied by hand one file at a time.
 *
 * "CANNOT TELL" MUST NEVER RENDER AS THE CONFIDENT ANSWER. A tree sitting
 * between `0204` and `0205` gets `PGRST202` from `ideacad_shared_with_me`, and
 * reporting that as "nothing is shared with you" is a confident answer to a
 * question nobody could ask. The panel is still MOUNTED -- the prop is not null
 * -- so a student learns the difference rather than seeing nothing at all.
 *
 * AND NO COUNT. Ledger 0201's first defect was a summary chip reading "2
 * documents shared with you" two lines above this sentence, on this exact
 * state; every content check passed because every word was correct and the one
 * thing wrong was that a number appeared at all.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-item?state=unavailable',
	label: 'IdeaCAD item page: a deployment that cannot ask says so',
	widths: WIDTHS,
	prepare: [{ waitFor: '() => typeof window.__ideacadItemControls === "function"' }],
	orderResult: [
		{
			label: 'the ladder sentence, no rows, no count, and the editor untouched',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["unavailable " + c.unavailable, "empty " + c.empty, "rows " + c.rows, "open " + c.open]; }',
			expected: ['unavailable 1', 'empty 0', 'rows 0', 'open 0']
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
	presence: [
		{ selector: '[data-testid="ideacad-shared"]', label: 'the panel is still mounted, so the student learns which absence this is', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-unavailable"]', label: 'the ladder sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-summary"]', label: 'the count, which is ledger 0201\'s first rasterized defect', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-empty"]', label: 'the empty sentence, which would be a confident answer here', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'rows, which there is no list to build', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-shared-unavailable"]',
			label: 'it reassures about the student\'s own work',
			must: ['Your own work is unaffected'],
			mustNot: ['Nobody has shared']
		}
	],
	contrast: [{ selector: '[data-testid="ideacad-shared-unavailable"]', label: 'the ladder sentence', min: 4.5 }],
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
