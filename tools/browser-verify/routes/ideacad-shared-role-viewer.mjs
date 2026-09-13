/**
 * THE VIEWER STATE, whose entire point is what is NOT on screen and what the
 * STORE refuses.
 *
 * A viewer must never be shown a control that would be refused, and `0205`
 * refuses every write from one. Opening is a READ, so a viewer legitimately
 * keeps the Open control -- which is why the absence claim that matters here is
 * not about this panel's buttons at all but about the store: `canWrite false`,
 * measured off the shipping `createIdeacadStore` rather than off a fixture flag.
 *
 * THE POSITIVE CONTROL IS A SIBLING ROUTE. `ideacad-shared-role-editor` drives
 * the identical page with `role=editor` and reports `canWrite true` on the same
 * two documents. Read the two together: false against true on one fixture is a
 * result, false alone is a probe that might simply be wrong.
 *
 * AND THE SENTENCE IS THE OTHER HALF. A row that cannot be edited and says
 * nothing about why reads as broken rather than as read-only, so the view-only
 * sentence is asserted PRESENT in the same breath.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-shared?role=viewer',
	label: 'IdeaCAD shared: a viewer opens the document read-only and the store refuses every write',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadSharedControls === "function"' },
		{ waitFor: '() => window.__ideacadSharedStore().documentId !== null' }
	],
	orderResult: [
		{
			label: 'the store opened READ-ONLY, which is the claim of this route',
			evaluate:
				'() => { const s = window.__ideacadSharedStore(); return ["phase " + s.phase, "canWrite " + s.canWrite, "role " + s.role]; }',
			expected: ['phase saved', 'canWrite false', 'role viewer']
		},
		{
			label: 'the row carries exactly ONE explanatory sentence, not two',
			evaluate:
				'() => Array.from(document.querySelectorAll("[data-testid=\\"ideacad-shared-row\\"]")).map((li, i) => "row " + i + " notes " + li.querySelectorAll(".row-note").length)',
			expected: ['row 0 notes 1', 'row 1 notes 1']
		},
		{
			label: 'both rows are view-only, with the row count as the control',
			evaluate:
				'() => { const c = window.__ideacadSharedControls(); return ["rows " + c.rows, "viewonly " + c.viewonly, "current " + c.current, "lost " + c.lost]; }',
			// Both fixture documents are view-only for this caller, so two sentences.
			expected: ['rows 2', 'viewonly 2', 'current 1', 'lost 0']
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
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'a row per shared document, the positive control for the zeros', expectPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-shared-viewonly"]', label: 'the role note, tagged because this role cannot write', expectPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-shared-rolenote"]', label: 'an editable row\'s note, which this viewer has none of', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the terminal notice, which a plain viewer must not see', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-empty"]', label: 'the empty sentence', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-shared"]',
			label: 'a viewer is told what they can and cannot do, in their own terms',
			// ONE SENTENCE, `sharing.ts`'s own. The panel carried a SECOND view-only
			// string under this one until the pages were rasterized, which put two
			// paragraphs saying the same thing on every viewer row -- and every
			// check passed, because both were present and both cleared contrast.
			must: ['View only', 'Shared with you to look at. You cannot make changes.'],
			mustNot: ['Can edit', 'undefined', 'ideacad_', '0205']
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-shared-viewonly"]', label: 'the view-only sentence', min: 4.5 },
		{ selector: '.chip.role.ro', label: 'the view-only role chip', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-shared-open"]', label: 'Open, which a viewer legitimately keeps because opening is a read', min: 44 }
	]
};
