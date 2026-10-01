/**
 * A TEACHER WHO HID THE CLASS TOOLS, THE THEME VOTE AND THE TEAMS (ledger
 * 0360, R23 on the R19 header), on the REAL class page, at 375 and 1440.
 *
 * A hidden piece of the header is not rendered at all (so the hall pass, the
 * music and the vote stop asking the database), the teams and the header's
 * teams key go together, and one quiet line names what is hidden and offers
 * Arrange, which opens Display settings at this page's arrangement with the
 * hidden pieces marked in words (the last row, so every read of the page is
 * taken before the dialog covers it). What is NOT hidden is the positive
 * control: the title, Next due, Quick post and the notice.
 */
import { CLASS_EDITOR_OPEN, IGNORE, VIEW_MEASURE, VIEW_READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?view=class&role=teacher&layout=hidden',
	label: 'The real class page as a teacher who hid the tools, the theme vote and the teams; Arrange opens the editor',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: VIEW_READY, label: 'the real class page has painted', timeoutMs: 30000 }, { evaluate: VIEW_MEASURE }],
	presence: [
		{ selector: '[data-testid="harness-class"] [data-testid="class-tools"]', label: 'the class tools, hidden: not rendered', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="harness-class"] [data-testid="class-theme-toggle"]', label: 'the theme vote, hidden: not rendered', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="harness-class"] [data-testid="class-teams"]', label: 'the teams, hidden: not rendered', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="harness-class"] [data-testid="class-header-teams"]', label: 'the header teams key goes with them', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="harness-class"] h1.pane-title', label: 'the title, still there', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-next-due"]', label: 'Next due, still there', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-post-open"]', label: 'Quick post, still there', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-posts"] [data-testid="quick-post"]', label: 'the notice, still there', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'the hidden-panels line', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="panels-hidden-note"]',
			label: 'the line names what is hidden, in the page order',
			must: ['Hidden on this page: Class tools, Class theme vote, Teams.', 'Arrange'],
			mustNot: ['—']
		}
	],
	contrast: [{ selector: '[data-testid="panels-hidden-note"] .phn-text', label: 'the hidden-panels line', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="panels-hidden-arrange"]', label: 'Arrange', min: 44 }],
	orderResult: [
		{
			label: "Arrange opens Display settings at the class page's arrangement, the hidden pieces marked inside the header row",
			evaluate: `async () => {
				const open = ${CLASS_EDITOR_OPEN};
				for (let i = 0; i < 20 && !open(); i++) {
					document.querySelector('[data-testid="panels-hidden-arrange"]')?.click();
					await new Promise((r) => setTimeout(r, 300));
				}
				const editor = document.querySelector('[data-testid="panel-layout-editor-class"]');
				const pieces = editor ? editor.querySelectorAll('[data-testid="panel-row"][data-panel="banner"] [data-testid="panel-piece"]').length : -1;
				const hiddenPieces = editor ? [...editor.querySelectorAll('[data-testid="panel-piece"]')].filter((p) => p.querySelector('[data-testid="panel-hidden-chip"]')).map((p) => p.dataset.panel) : [];
				const teamsHidden = !!editor?.querySelector('[data-testid="panel-row"][data-panel="teams"] [data-testid="panel-hidden-chip"]');
				return ['editor open=' + open(), 'pieces in the header row=' + pieces, 'hidden pieces=' + hiddenPieces.join(','), 'teams row hidden=' + teamsHidden];
			}`,
			expected: ['editor open=true', 'pieces in the header row=3', 'hidden pieces=tools,theme', 'teams row hidden=true']
		}
	]
};
