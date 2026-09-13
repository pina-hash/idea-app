/**
 * A SHARED EDITOR OPENS A CLASSMATE'S DOCUMENT. The positive-control route for
 * every zero the viewer and callbacks routes report.
 *
 * `0205` shipped `ideacad_shared_with_me` and `ideacad_open_shared_document` and
 * NEITHER HAD A CALLER, so this is the first route in the repository that puts a
 * shared document on screen at all. What it measures is that the list renders,
 * that the row already open carries a WORD rather than a second control, and
 * that the store actually opened -- `canWrite true` off the shipping store, not
 * a fixture flag.
 *
 * THE GEOMETRY IS THE HALF THAT CANNOT BE SEEN. This Chromium paints no
 * scrollbar into a screenshot at any colour, so an Open control past the panel's
 * right edge is invisible to the eye and to every content check. The verdicts
 * are computed in the page and read here.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-shared?role=editor',
	label: 'IdeaCAD shared: an editor sees what was shared with them and opens one',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadSharedControls === "function"' },
		{ waitFor: '() => window.__ideacadSharedStore().documentId !== null' }
	],
	orderResult: [
		{
			label: 'the list, and the row count as the control for every zero elsewhere',
			evaluate:
				'() => { const c = window.__ideacadSharedControls(); return ["rows " + c.rows, "open " + c.open, "current " + c.current, "viewonly " + c.viewonly, "lost " + c.lost]; }',
			// Two shared documents, one of them open: one Open control on the other
			// row, one Open-now mark on this one, and one view-only sentence on the
			// row that is view-only.
			expected: ['rows 2', 'open 1', 'current 1', 'viewonly 1', 'lost 0']
		},
		{
			label: 'the SHIPPING store opened the document and reports it writeable',
			evaluate:
				'() => { const s = window.__ideacadSharedStore(); return ["phase " + s.phase, "canWrite " + s.canWrite, "role " + s.role, "accessLost " + s.accessLost]; }',
			expected: ['phase saved', 'canWrite true', 'role editor', 'accessLost false']
		},
		{
			label: 'the Open control is a BUTTON and not a bar across the row',
			// THE DEFECT RASTERIZING CAUGHT, pinned. The note spans both columns, so
			// the button fell into the next implicit row and stretched across
			// `minmax(0, 1fr)`: 873px wide at 1440, present, visible, over 44px and
			// correctly labelled -- invisible to every check there was.
			evaluate:
				'() => { const b = document.querySelector("[data-testid=\\"ideacad-shared-open\\"]"); const li = b.closest("li"); const w = b.getBoundingClientRect().width; return ["open button " + (w < li.getBoundingClientRect().width * 0.5 ? "is sized to its label" : "spans " + Math.round(w) + "px of the row"), "and is at least 44px wide: " + (w >= 44)]; }',
			expected: ['open button is sized to its label', 'and is at least 44px wide: true']
		},
		{
			label: 'nothing runs off the window and every control is inside its panel',
			evaluate: '() => window.__ideacadSharedVerdicts()',
			expected: [
				'the shared list is on screen ok',
				'nothing is wider than the window ok',
				'every control sits inside the panel that owns it ok',
				'every row sits inside the panel ok',
				'the owner address is inside its row ok',
				'the owner address has height ok',
				'no row carries both an Open control and the Open-now mark ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'a row per shared document', expectPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-shared-open"]', label: 'Open, on the row that is not open', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-current"]', label: 'the Open-now mark, where a second control would otherwise sit', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-summary"]', label: 'the summary line', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-empty"]', label: 'the empty sentence, which must not appear beside a list', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-unavailable"]', label: 'the ladder sentence, which must not appear on a working deployment', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the terminal notice', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-shared"]',
			label: 'the list names the owner and says what each role means',
			must: ['Shared with you', 'ana.reyes@boscotech.net', 'luis.ortega@boscotech.net', 'Can edit', 'View only', 'Open now'],
			mustNot: ['undefined', 'NaN', 'null', 'ideacad_']
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-shared-summary"]', label: 'the summary line', min: 4.5 },
		{ selector: '.owner', label: 'the owner address, which is how two documents are told apart', min: 4.5 },
		{ selector: '[data-testid="ideacad-shared-current"]', label: 'the Open-now mark', min: 4.5 },
		{ selector: '[data-testid="ideacad-shared-viewonly"]', label: 'the view-only sentence', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-shared-open"]', label: 'Open', min: 44 }]
};
