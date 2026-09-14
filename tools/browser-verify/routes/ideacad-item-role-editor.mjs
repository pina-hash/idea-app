/**
 * THE MOUNT, MEASURED. A shared EDITOR grant opened on the real item page.
 *
 * `/dev/ideacad-shared` measures the PANEL and passes on the day the panel is
 * mounted nowhere, which is the state the repository was in for three days.
 * This route mounts the real `ItemDetail`, so the questions only the join can
 * answer get asked: the panel is inside `.engine-host` (a different container
 * from the pane its container query was measured in), the editor shows the
 * SHARED document rather than the load payload, and there is a way back out.
 *
 * THE WIDTH CLAIMS ARE THE ONES THAT MATTER HERE. Ledger 0201 passed 162
 * measurements with 0 outside threshold and then found an "Open" button 873px
 * wide by looking -- present, visible, over 44px, correctly labelled, and
 * wrong. `no control in the shared panel is wider than half its panel` and
 * `the way back is inside the banner and is not stretched across it` are that
 * defect asked directly, in the container this bundle newly puts the panel in.
 */
import { WIDTHS } from './_shared.mjs';

import { IDEACAD_DRAWN } from './_ideacad-drawn.mjs';

/* THE THREE "WAS ANYTHING ACTUALLY DRAWN" CHECKS (ledger 0247). Stated once in
   `_ideacad-drawn.mjs` because they are properties of the Blade editor rather
   than of this state; see that file for which routes take them and why. */

export default {
	...IDEACAD_DRAWN,
	path: '/dev/ideacad-item?role=editor',
	label: 'IdeaCAD item page: a document a classmate shared, with an editor grant',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadItemStore === "function"' },
		{ waitFor: '() => window.__ideacadItemStore().documentId !== null' },
		/* THE THREE WIDTHS THE STRETCH VERDICT IS ABOUT, PRINTED. The verdict
		   answers ok/FAIL; a later reader needs the numbers to see how much
		   room there actually is, which is what turned ledger 0201's 873px
		   button from "passes every check" into a defect. */
		{
			evaluate:
				'() => { const b = document.querySelector(\'[data-testid="ideacad-reading-shared"]\'); const k = document.querySelector(\'[data-testid="ideacad-return-mine"]\'); const p = document.querySelector(\'[data-testid="ideacad-shared"]\'); const w = (el) => el ? Math.round(el.getBoundingClientRect().width) : -1; return "banner " + w(b) + "px, way-back " + w(k) + "px, shared panel " + w(p) + "px"; }'
		}
	],
	orderResult: [
		{
			label: 'the store opened the SHARED document as an editor',
			evaluate:
				'() => { const s = window.__ideacadItemStore(); return ["role " + s.role, "canWrite " + s.canWrite, "accessLost " + s.accessLost]; }',
			expected: ['role editor', 'canWrite true', 'accessLost false']
		},
		{
			label: 'the editor on screen is the CLASSMATE\'s document, with its write controls',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["editors " + c.editors, "concept " + c.concept, "undo " + c.undo, "accept " + c.accept, "banner " + c.banner, "back " + c.back]; }',
			// `Their concept` is the shared document's concept name; `My concept`
			// is the LOAD payload's, and seeing it here would mean the mount fell
			// through to the manager arm and put the student's own blade on screen
			// under a heading about somebody else's.
			expected: [
				'editors 1',
				'concept Their concept',
				'undo 1',
				'accept 1',
				'banner 1',
				'back 1'
			]
		},
		{
			label: 'the Sharing panel is NOT mounted on a classmate\'s document',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["sharePanel " + c.sharePanel, "shareForm " + c.shareForm]; }',
			// `ideacadCanShare` is true for `owner` alone, so on a shared document
			// this panel could only ever render a heading, a role chip and
			// `IDEACAD_ROLE_NOTES.editor` -- which is byte-identical to the note
			// the shared row for the SAME document renders 150px above it. Found
			// by rasterizing the mount and looking; `?role=owner` is the positive
			// control and gets both.
			expected: ['sharePanel 0', 'shareForm 0']
		},
		{
			label: 'nothing overflows its container, and no control is stretched across one',
			evaluate: '() => window.__ideacadItemVerdicts()',
			expected: [
				'nothing is wider than the window ok',
				'the engine host is on screen ok',
				'the shared panel sits inside the engine host ok',
				'no control in the shared panel is wider than half its panel ok',
				'every control sits inside the panel that owns it ok',
				'every row sits inside the panel ok',
				'the reading-shared banner sits inside the engine host ok',
				'the way back is inside the banner and is not stretched across it ok',
				'the way back clears 44px ok',
				'no row carries both an Open control and the Open-now mark ok'
			]
		}
	],
	presence: [
		{
			selector: '.cr-root',
			label: 'the room production is in actually mounted',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-shared"]',
			label: 'the shared list, which is the whole of what this bundle mounts',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-shared-row"]',
			label: 'both shared documents',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		},
		{
			selector: '[data-testid="ideacad-shared-current"]',
			label: 'the Open-now mark on the row already on screen',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-shared-open"]',
			label: 'one Open control, on the row that is not open',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-reading-shared"]',
			label: 'the line saying whose work is on screen',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-return-mine"]',
			label: 'the way back, which is what stops Open being a one-way door',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			// The ABSENCE that rides beside the presences above: the fallback
			// sentence is for a surface with no way back, and this one has one.
			selector: '[data-testid="ideacad-return-absent"]',
			label: 'the reload fallback, which must NOT appear when the control is there',
			expectPresent: 0
		},
		{
			selector: '[data-testid="ideacad-shared-access-lost"]',
			label: 'the terminal notice, which a live grant must NOT produce',
			expectPresent: 0
		},
		{
			selector: '[data-testid="ideacad-share"]',
			label: 'the Sharing panel, which a non-owner must NOT be shown',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-reading-shared"]',
			label: 'the banner names the owner and says what is missing',
			must: ['luis.ortega@boscotech.net', 'Your own blade is not on screen'],
			mustNot: ['undefined', 'null']
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-reading-shared"] .ic-elsewhere-text', label: 'the banner sentence', min: 4.5 },
		{ selector: '[data-testid="ideacad-return-mine"]', label: 'the way back', min: 4.5 },
		{ selector: '[data-testid="ideacad-shared-rolenote"]', label: 'the role note on a writable row', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-return-mine"]', label: 'the way back', min: 44 },
		{ selector: '[data-testid="ideacad-shared-open"]', label: 'the Open control', min: 44 }
	],
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
