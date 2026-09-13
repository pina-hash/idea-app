/**
 * THE PAGE-BUG STATE. Ledger 0195's shape, applied to the store.
 *
 * The rule is that a viewer must never see a control that would be refused, and
 * the way 0195 proved it was against `assembly.canWrite` rather than against
 * whether a callback happened to be handed in -- because a wiring mistake hands
 * every callback down regardless, and a proof that rests on absence cannot see
 * that case at all.
 *
 * So this route drives exactly that mistake: a read-only document is opened, and
 * then every one of the store's NINE write methods is called anyway. Each must
 * come back refused, the revision must not move, and the panel must be unchanged
 * -- which is what makes the gate structural rather than a convention the page
 * is trusted to follow.
 *
 * THE ATTEMPT COUNT IS ASSERTED, not just the refusal count. A probe that
 * attempted nothing would otherwise report nine refusals out of nine and read as
 * a clean pass over a loop that never ran.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-shared?role=viewer&state=callbacks',
	label: 'IdeaCAD shared: every write handed in over a read-only payload is still refused',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadSharedStore === "function"' },
		{ waitFor: '() => window.__ideacadSharedStore().attempted === 9' }
	],
	orderResult: [
		{
			label: 'nine writes attempted, nine refused, and the revision did not move',
			evaluate:
				'() => { const s = window.__ideacadSharedStore(); return ["attempted " + s.attempted, "refused " + s.refused, "canWrite " + s.canWrite, "revision " + s.revision]; }',
			// 4 is the revision the fixture's concept was opened at. A write that
			// landed would move it, which is the thing no content check can see.
			expected: ['attempted 9', 'refused 9', 'canWrite false', 'revision 4']
		},
		{
			label: 'every refusal is 0205\'s own sentence, rendered verbatim and not re-toned',
			evaluate:
				'() => { const lines = Array.from(document.querySelectorAll("[data-testid=\\"ideacad-shared-probe\\"] li")).map((li) => li.textContent || ""); return ["view-only refusals " + lines.filter((t) => t.includes("view-only access")).length, "writes that landed " + lines.filter((t) => t.includes("WROTE")).length]; }',
			// AN ARRAY, because `orderResult` compares element for element. The
			// second element is the one that matters: nine refusals with one write
			// also landing would be a partial gate, and a count of refusals alone
			// cannot see it.
			expected: ['view-only refusals 9', 'writes that landed 0']
		},
		{
			label: 'the panel is unchanged by nine refused writes',
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
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'the rows survived, which is the control for the counts above', expectPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-shared-viewonly"]', label: 'the view-only sentence is still there', expectPresent: 2, expectVisible: 2 },
		/* NO TERMINAL NOTICE. A refused write on a document that was ALWAYS
		   read-only is not a lost grant, and reporting it as one would tell a
		   viewer their access was removed when it never changed. */
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the terminal notice, which a refusal on a read-only document must NOT produce', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-shared-probe"]',
			label: 'the refusals say the same thing the database says',
			must: ['You have view-only access to this document.'],
			mustNot: ['WROTE (this is the defect)', 'undefined']
		}
	],
	contrast: [{ selector: '[data-testid="ideacad-shared-viewonly"]', label: 'the view-only sentence', min: 4.5 }],
	tapTargets: []
};
