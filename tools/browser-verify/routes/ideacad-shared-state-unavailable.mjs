/**
 * A DEPLOYMENT WITH NO `0205` -- the other half of the pair, and the one whose
 * sentence must be different.
 *
 * Migrations here are applied by hand, so a tree sitting between `0204` and
 * `0205` is a REAL state: `ideacad_shared_with_me` does not exist, PostgREST
 * answers `PGRST202`, and the honest thing is to render no list and say why. The
 * failure this route exists to catch is the panel borrowing the EMPTY sentence
 * instead, which would tell a student nobody had shared anything with them when
 * the truth is that nobody could find out.
 *
 * ROWS HANDED IN ARE STILL NOT RENDERED. The harness passes the full list
 * alongside the off capability, which is what a caller with a stale copy does,
 * and the panel must show none of it.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-shared?state=unavailable',
	label: 'IdeaCAD shared: a deployment with no 0205 says so, and does not answer the question',
	widths: WIDTHS,
	prepare: [{ waitFor: '() => typeof window.__ideacadSharedControls === "function"' }],
	orderResult: [
		{
			label: 'the ladder sentence, and NOT the empty one, with no row rendered',
			evaluate:
				'() => { const c = window.__ideacadSharedControls(); return ["rows " + c.rows, "unavailable " + c.unavailable, "empty " + c.empty, "open " + c.open, "summary " + document.querySelectorAll("[data-testid=\\"ideacad-shared-summary\\"]").length]; }',
			// `rows 0` with a full list handed in is the claim: a stale copy beside a
			// capability that is off must not be rendered as an answer.
			expected: ['rows 0', 'unavailable 1', 'empty 0', 'open 0', 'summary 0']
		},
		{
			label: 'the panel fits and nothing runs off the window',
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
		{ selector: '[data-testid="ideacad-shared-unavailable"]', label: 'the ladder sentence', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'a row, from the stale list handed in beside the off capability', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-empty"]', label: 'the EMPTY sentence, which this state must not borrow', expectPresent: 0 },
		/* SCOPED TO THE PANEL, AND THE FIRST DRAFT WAS NOT. A page-wide `button`
		   selector reported 1 at both widths -- `SiteFeedback`, the report control
		   the root layout mounts on every route, which is exactly the coverage
		   CLAUDE.md wants there. A selector that reaches outside the component
		   under test measures the shell. */
		{ selector: '[data-testid="ideacad-shared"] button', label: 'any control inside the panel', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-shared"]',
			label: 'it says the site cannot do this yet, in the student\'s own terms',
			must: ['Shared with you', 'not switched on for this site yet', 'Your own work is unaffected'],
			/* 'documents shared with you' IS THE DEFECT THIS PASS FOUND, pinned by
			   text so it cannot return: the summary chip rendered a COUNT beside a
			   sentence saying the count was unknowable. */
			mustNot: ['Nobody has shared a document with you', 'documents shared with you', 'ana.reyes@boscotech.net', 'ideacad_', 'PGRST202', '0205']
		}
	],
	contrast: [{ selector: '[data-testid="ideacad-shared-unavailable"]', label: 'the ladder sentence', min: 4.5 }],
	tapTargets: []
};
