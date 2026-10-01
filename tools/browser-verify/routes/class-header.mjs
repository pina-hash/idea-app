/**
 * THE CLASS HEADER, AS A STUDENT SEES IT (ledger 0360, reports R19, R21, R22),
 * at 375 and 1440.
 *
 * Mr. Pina: the class banner "has no function other than to say the title of
 * a class ... it's just taking up space." The header that replaced it is one
 * block in the voted banner: the class name, the hall pass and the music, and
 * one key row with the class's identity, the next thing due and the class
 * theme. Under it, a teacher's notice, unmistakable; then the student's team.
 *
 * WHAT ONLY A BROWSER CAN SAY: the header's height and where the class starts
 * under it (printed by the first prepare step), the words' contrast on the
 * washed banner and on the notice card, every new key at 44px, and that the
 * pattern layer moves only under `no-preference`.
 */
import { COVERS, IGNORE, MEASURE, READY, THEME_READY, WHOLE } from './_class-header.mjs';

export default {
	path: '/dev/class-header',
	label: 'Class header: one compact block, the next due key, a notice, as a student',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: READY, label: 'the header and its notice have painted' }, THEME_READY, { evaluate: MEASURE }],
	presence: [
		{ selector: '[data-testid="class-header"]', label: 'the class header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="harness-class"] h1.pane-title', label: 'ONE class title, the page h1', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-banner"] [data-testid="class-header"]', label: 'the header inside the voted banner', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-header"] [data-testid="class-tools"]', label: 'the layout\u2019s tools row, boxless inside the header', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '[data-testid="class-header-row"] .ctool-trigger', label: 'the hall pass and music, in the key row', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="class-header-meta"]', label: 'the class identity chip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-next-due"]', label: 'the Next due key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-header-row"] [data-testid="class-theme-toggle"]', label: 'the class theme, a key in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-posts"] [data-testid="quick-post"]', label: 'the teacher’s notice', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-mine"]', label: 'the student’s own team, under the notice', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* A student is offered no teacher key. */
		{ selector: '[data-testid="quick-post-open"]', label: 'Quick post (a teacher key)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="class-header-teams"]', label: 'the teams key (a teacher key)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="quick-post-take-down"]', label: 'Take down (a teacher key)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="quick-post-manage"]', label: 'the classes a notice went to (a teacher line)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="class-banner-pattern"]', label: 'the pattern layer, decoration only', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'the class name on the washed banner', min: 4.5 },
		{ selector: '[data-testid="class-header-meta"]', label: 'the class identity on its chip', min: 4.5 },
		{ selector: '[data-testid="class-next-due"] .ch-text', label: 'the next due title on its key', min: 4.5 },
		{ selector: '[data-testid="class-next-due"] .ch-when', label: 'the next due date on its key', min: 4.5 },
		{ selector: '[data-testid="quick-post"] .qp-word', label: 'the word Notice', min: 4.5 },
		{ selector: '[data-testid="quick-post-until"]', label: 'when the notice ends', min: 4.5 },
		{ selector: '[data-testid="quick-post-body"]', label: 'the notice itself', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="class-next-due"]', label: 'Next due', min: 44 },
		{ selector: '[data-testid="class-header-row"] [data-testid="class-theme-toggle"]', label: 'Class theme', min: 44 },
		{ selector: '[data-testid="class-tools"] .ctool-trigger', label: 'Hall pass and Music', min: 44 }
	],
	motion: [
		{ selector: '[data-testid="class-banner-pattern"]', label: 'the pattern drift, gated behind no-preference', expect: 'gated' }
	],
	orderResult: [
		{ label: 'the moving ripples cover the banner at every tenth of the drift', evaluate: COVERS, expected: ['animated=true', 'moved=true', 'covered=true'] },
		{
			label: 'every tool, theme and due word whole, tile or not',
			evaluate: WHOLE,
			expected: ['tool words whole=true', 'tool statuses whole=true', 'theme word whole=true', 'next due words whole=true']
		}
	]
};
