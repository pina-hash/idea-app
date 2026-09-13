/**
 * THE GRANT REMOVED WHILE THE DOCUMENT IS OPEN -- the terminal state, reached
 * through the REAL store reacting to the REAL refusal rather than by setting a
 * flag.
 *
 * The harness opens the document, revokes the grant behind the fixture, and
 * edits. `0205` re-asks `_ideacad_can_write_document` inside every write RPC, so
 * the save is refused; `store.ts` then asks `ideacad_shared_with_me` -- which
 * answers rather than raising, which is the whole reason it and not
 * `ideacad_open_shared_document` is the question -- and goes terminal.
 *
 * LEDGER 0190'S LESSON, APPLIED. Its `state=expiring` originally seeded the
 * state directly and measured a chip that said the opposite of what it meant,
 * because the shipping controller kept its own hold alive. A fixture that seeds
 * a terminal state proves nothing about the mechanism that produces it.
 *
 * THE SENTENCE IS THE FINDING. It must be the access-lost one and NOT
 * `conflict`'s 'changed elsewhere', which on this path would be a lie: nothing
 * changed elsewhere, the access did.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-shared?role=editor&state=lost',
	label: 'IdeaCAD shared: a grant removed mid-session is SEEN, not discovered on a refused write',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadSharedStore === "function"' },
		{ waitFor: '() => window.__ideacadSharedStore().accessLost === true' }
	],
	orderResult: [
		{
			label: 'the store is TERMINAL, and it got there through the real refusal',
			evaluate:
				'() => { const s = window.__ideacadSharedStore(); return ["phase " + s.phase, "accessLost " + s.accessLost, "role " + s.role]; }',
			// `conflict` is reused because the consequence is identical: terminal, no
			// further write attempted, the local copy untouched.
			expected: ['phase conflict', 'accessLost true', 'role editor']
		},
		{
			label: 'the notice is on screen, with the row count as the control',
			evaluate:
				'() => { const c = window.__ideacadSharedControls(); return ["rows " + c.rows, "lost " + c.lost, "current " + c.current]; }',
			// `current 0`: the Open-now mark is gone from the row that lost access,
			// and the other row never had one.
			expected: ['rows 2', 'lost 1', 'current 0']
		},
		{
			label: 'the lost row and the notice AGREE, which no content check compares',
			evaluate:
				'() => { const row = document.querySelectorAll("[data-testid=\\"ideacad-shared-row\\"]")[0].textContent || ""; return ["row claims edit access: " + row.includes("Can edit"), "row claims it is open: " + row.includes("Open now"), "row says access removed: " + row.includes("Access removed")]; }',
			expected: [
				'row claims edit access: false',
				'row claims it is open: false',
				'row says access removed: true'
			]
		},
		{
			label: 'the notice and its mark fit, and nothing runs off the window',
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
		},
		{
			label: 'the mark sits beside the FIRST line of the sentence, not the middle one',
			// Ledger 0190's third defect, in this notice's own markup: `align-items:
			// center` put the "!" beside line two at 375, where it reads as an
			// interruption rather than a marker. Only a geometric read sees it.
			evaluate:
				'() => { const n = document.querySelector("[data-testid=\\"ideacad-shared-access-lost\\"]"); const m = n.querySelector(".mark").getBoundingClientRect(); const s = n.querySelector("span:not(.mark)").getBoundingClientRect(); return [m.top <= s.top + 4 ? "mark on the first line" : "mark at " + Math.round(m.top - s.top) + "px below the sentence top", s.height > m.height + 2 ? "the sentence wraps, so the alignment is load-bearing here" : "the sentence is one line at this width"]; }',
			// AN ARRAY, because `orderResult` compares element for element and a
			// bare string can never pass -- the harness says so rather than
			// reporting a pass, which is the instrument working.
			//
			// THE SECOND ELEMENT SAYS WHETHER THE FIRST WAS WORTH CHECKING. The
			// alignment defect is only visible where the sentence wraps, so a run
			// at a width where it does not is a vacuous pass, and this names which
			// happened rather than hiding it.
			expected: ['mark on the first line', 'the sentence wraps, so the alignment is load-bearing here']
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the terminal notice', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'the rows are STILL listed, so the student can ask for the document again', expectPresent: 2, expectVisible: 2 },
		/* THE ROW STOPS CLAIMING THE ROLE, which is the contradiction rasterizing
		   caught: "Can edit" and "Open now" three lines under a notice saying the
		   access was gone. The row is the half a student actually reads. */
		{ selector: '[data-testid="ideacad-shared-row-lost"]', label: 'the lost row says so in its own chip', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-current"]', label: 'the Open-now mark, which a lost row must NOT carry', expectPresent: 0 },
		/* AND THE HEADER COUNT GOES WITH IT. The list was fetched before the grant
		   went away, so "1 you can edit" counts a document the student has just
		   been told they cannot open -- the same contradiction, milder, two lines
		   higher. */
		{ selector: '[data-testid="ideacad-shared-summary"]', label: 'the summary count, which is stale the moment access is lost', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-shared-access-lost"]',
			label: 'it says what is still true before what is gone, and is not conflict\'s sentence',
			must: ['no longer have access', 'What is on screen is still here', 'Ask the owner'],
			mustNot: ['changed elsewhere', 'ideacad_', 'concept', 'undefined']
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the terminal notice', min: 4.5 }
	],
	tapTargets: []
};
