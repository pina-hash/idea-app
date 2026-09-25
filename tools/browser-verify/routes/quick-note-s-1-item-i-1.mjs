import { HEADER_EXPECTED, HEADER_PROBE, IGNORE_FIXTURE_PHOTO, OPEN, TYPE } from './_quick-note.mjs';

/**
 * THE QUICK NOTE, WRITTEN FROM AN ASSIGNMENT PAGE (ledger 0298, R33), in the
 * REAL `ClassroomShell` beside the REAL Report slot and the REAL profile menu,
 * driven end to end: open, type, autosave, Save.
 *
 * WHAT IS MEASURED:
 *   - the header row at rest (before anything opens): one Note control for the
 *     width -- in the row from 560px up, in the Menu below it -- with Report and
 *     the profile menu each answering a tap at their own centre and a whole
 *     class icon still on screen (`_quick-note.mjs` says why that is the bar);
 *   - the panel opens inside the viewport, which on a phone is the claim;
 *   - the WRITE: typing autosaves a PRIVATE DRAFT through the note door, filed
 *     to this class and titled by this assignment, and Save stamps a boundary.
 *     Read off the harness's own transport log, element for element.
 */
const TEXT = 'Gusset plate is 3.2 mm, drawing says 3.0';

export default {
	path: '/dev/quick-note/s-1/item/i-1',
	label: 'Quick note: written, autosaved and saved from an assignment page, with the header row read at rest',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [
		{
			/* The Menu entry exists only once the dock has hydrated and said it is here. */
			waitFor: '() => !!document.querySelector("[data-testid=\\"quicknote-menu-item\\"]") && !!document.querySelector(".pm-trigger")',
			timeoutMs: 20000
		},
		{ evaluate: HEADER_PROBE },
		{ evaluate: OPEN },
		{ evaluate: TYPE(TEXT) },
		/* THE AUTOSAVE, which nothing presses: 800ms after the last keystroke. */
		{
			waitFor: '() => /POST \\/api\\/notebook\\/note /.test(document.querySelector("[data-testid=\\"qn-log\\"]").textContent)',
			timeoutMs: 15000
		},
		{
			click: '[data-testid="qn-save"]',
			until: '() => !!document.querySelector("[data-testid=\\"qn-done\\"]")',
			attempts: 12,
			waitMs: 250
		}
	],
	presence: [
		{ selector: '.cr-header [data-testid="qn-trigger"]', label: 'the Note control, one, in the header (drawn from 560px up; the header probe reads the width)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '.shell-tools [data-testid="qn-trigger"]', label: 'the row control is never inside the fold (the row above is the positive control)', expectPresent: 0 },
		{ selector: '.cr-header .shell-report .sfb-trigger', label: 'Report still in its own slot beside it', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="qn-done"]', label: 'the saved confirmation, where the box was', expectPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="qn-trigger"]', label: 'the control carries its word, not only its glyph', must: ['Note'] },
		{ selector: '[data-testid="qn-done"]', label: 'says where the note went and that it is private', must: ['ENG1H', 'Truss bridge analysis', 'private'] }
	],
	contrast: [{ selector: '[data-testid="qn-done"]', label: 'the saved confirmation', min: 4.5 }],
	tapTargets: [
		{ selector: '[data-testid="qn-another"]', label: 'Write another', min: 44 },
		{ selector: '[data-testid="qn-panel"] [data-testid="qn-open-notebook"]', label: 'Open notebook', min: 44 },
		{ selector: '[data-testid="qn-close"]', label: 'Close', min: 44 }
	],
	orderResult: [
		{
			label: 'the header at rest: one Note control for this width, Report and the profile menu answer at their centres, a class icon survives',
			evaluate: '() => window.__qnHeader',
			expected: HEADER_EXPECTED
		},
		{
			label: 'the panel opened inside the viewport',
			evaluate: `() => {
				const p = document.querySelector('[data-testid="qn-panel"]').getBoundingClientRect();
				return [p.left >= 0 && p.right <= window.innerWidth + 0.5 ? 'inside horizontally' : 'OFF THE SIDE ' + Math.round(p.left) + '..' + Math.round(p.right), p.top >= 0 ? 'below the top' : 'ABOVE THE TOP'];
			}`,
			expected: ['inside horizontally', 'below the top']
		},
		{
			label: 'a private draft, filed to this class and titled by this assignment, then a boundary on Save',
			evaluate: `() => [...document.querySelectorAll('[data-testid="qn-log"] li')].map((li) => li.textContent.replace(/note_id="[^"]*"|p_entry_id="[^"]*"/g, '').trim()).filter((l, i, all) => all.indexOf(l) === i)`,
			expected: [
				'POST /api/notebook/note section_id="s-1" session_id=null custom_label="Truss bridge analysis" submitted=false autosave=true',
				'RPC notebook_seal_notes'
			]
		}
	]
};
