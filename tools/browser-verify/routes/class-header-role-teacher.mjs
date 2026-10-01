/**
 * THE CLASS HEADER AS THE CLASS'S TEACHER SEES IT (ledger 0360, reports R19
 * and R22), at 375 and 1440.
 *
 * The teacher's keys share the student's one row: the posted-teams key (which
 * replaced the full-width "Teams posted" strip), Quick post, and the class
 * view's own New post and Units. A notice the teacher can take down says how
 * many classes it went to, and the first press of Take down only arms it. The
 * student spec is the negative control for every teacher key.
 */
import { IGNORE, MEASURE, POSTING_LINE, READY, THEME_READY, WHOLE } from './_class-header.mjs';

export default {
	path: '/dev/class-header?role=teacher',
	label: 'Class header, teacher: the teams key, Quick post, and a notice they can take down',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the header and its notice have painted' },
		THEME_READY,
		{ evaluate: MEASURE },
		{
			click: '[data-testid="quick-post-take-down"]',
			until: `() => !!document.querySelector('[data-testid="quick-post-take-down-confirm"]')`,
			label: 'the first press of Take down arms it and names the classes'
		}
	],
	presence: [
		{ selector: '[data-testid="harness-class"] h1.pane-title', label: 'ONE class title, the page h1', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-post-open"]', label: 'Quick post', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-header-teams"]', label: 'the posted-teams key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-teams-posted"]', label: 'the old full-width teams strip', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="class-next-due"]', label: 'the Next due key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-door"]', label: 'the live class door, in the tools', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-post-manage"]', label: 'the classes the notice went to', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-post-take-down-confirm"]', label: 'the armed Take down', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-post-take-down-keep"]', label: 'Keep it', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-mine"]', label: 'an own-team card (a teacher is on no team)', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="quick-post-take-down-confirm"]',
			label: 'the second press names what it costs',
			must: ['Take it down from 1 class']
		},
		{ selector: '[data-testid="class-header-teams"]', label: 'the teams key says until when, and where', must: ['Teams posted', 'Manage in People'] }
	],
	contrast: [
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'the class name on the washed banner', min: 4.5 },
		{ selector: '[data-testid="class-header-teams"] .ch-text', label: 'the teams key', min: 4.5 },
		{ selector: '[data-testid="quick-post-open"]', label: 'Quick post', min: 4.5 },
		{ selector: '[data-testid="quick-post-manage"] .qp-reach', label: 'the classes it went to', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="quick-post-open"]', label: 'Quick post', min: 44 },
		{ selector: '[data-testid="class-header-teams"]', label: 'the teams key', min: 44 },
		{ selector: '[data-testid="quick-post-take-down-confirm"]', label: 'Take it down', min: 44 },
		{ selector: '[data-testid="quick-post-take-down-keep"]', label: 'Keep it', min: 44 },
		{ selector: '[data-testid="live-door"]', label: 'Live class', min: 44 }
	],
	orderResult: [
		{
			label: 'every tool, theme and due word whole, tile or not',
			evaluate: WHOLE,
			expected: ['tool words whole=true', 'tool statuses whole=true', 'theme word whole=true', 'next due words whole=true']
		},
		{ label: 'Quick post, New post and Units on one line', evaluate: POSTING_LINE, expected: ['posting keys present=true', 'posting keys on one line=true'] }
	]
};
