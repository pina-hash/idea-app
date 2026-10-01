/**
 * CLASS THEMES BY CLASS VOTE (decision 45, report R07), as a student sees them,
 * at 375 and 1440.
 *
 * Mr. Pina: every class looked the same, and he wanted each class to have its
 * own look -- chosen by the class. A course's students vote on a palette, a
 * pattern and a badge; the most-voted option of each wins for every block of
 * the course; a teacher gives each block its own accent. The fixture: Period 2
 * (gold accent) and Period 4 (sky accent) of one course, with votes giving the
 * Ocean palette, the Rings pattern and the Gear badge, and an FRC class nobody
 * has voted on, which must draw exactly as before.
 *
 * WHAT ONLY A BROWSER CAN SAY: the class name's contrast on the WASHED banner
 * (a translucent colour over the room's own ground, composited by the check's
 * ground walk), the accent stripe, strip bar and card edge at 3:1 on their own
 * composited ground, and that voting repaints the banner at once.
 */
import { GRAPHIC_PASS, GRAPHIC_REPORT, IGNORE, OPEN_PANEL, READY } from './_classroom-theme.mjs';

export default {
	path: '/dev/classroom-theme',
	label: 'Class theme: the voted banner, the vote panel, and the class cards and keys',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the class page and the three class cards have painted' },
		{ waitFor: `() => !!document.querySelector('[data-testid="class-theme-toggle"]')`, label: 'the vote panel read its tally and is offered' },
		{ evaluate: GRAPHIC_REPORT },
		OPEN_PANEL,
		{
			waitFor: `() => document.querySelectorAll('[data-testid="class-theme-vote"]').length === 18`,
			label: 'every option of all three features is a vote key (6 palettes, 5 patterns, 7 badges)'
		},
		{
			/* THE TIE RULE, SEEN FROM A STUDENT'S SEAT. Ocean leads Ember 2-1;
			   Ana's vote for Ember makes it 2-2, and a tie goes to the option
			   whose latest vote is EARLIEST, which is Ocean -- so the banner must
			   NOT flip to Ember on the vote that only drew level. The repaint on
			   a winning vote is asserted in tests/dom/class-theme-panel-mount. */
			label: 'vote for Ember: the key is pressed, its count moves, and the tie stays with the earlier option',
			evaluate: `async () => {
				const key = [...document.querySelectorAll('[data-testid="class-theme-feature"][data-feature="palette"] [data-testid="class-theme-vote"]')].find((b) => b.textContent.includes('Ember'));
				key.click();
				for (let i = 0; i < 40; i++) {
					if (key.getAttribute('aria-pressed') === 'true') break;
					await new Promise((r) => setTimeout(r, 50));
				}
				window.__themeVote = {
					pressed: key.getAttribute('aria-pressed'),
					count: key.querySelector('[data-testid="class-theme-count"]').textContent.trim(),
					banner: document.querySelector('[data-testid="class-banner"]').dataset.palette,
					said: document.querySelector('[data-testid="class-theme-said"]').textContent.trim()
				};
				return JSON.stringify(window.__themeVote);
			}`
		}
	],
	presence: [
		{ selector: '[data-testid="class-banner"]', label: 'the class banner', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-banner-badge"]', label: 'the badge beside the class name', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'ONE class title, inside the banner', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-banner-words"]', label: 'the theme in words, for a screen reader', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '[data-testid="class-theme-words"]', label: 'the theme in words, visible on the panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-theme-feature"]', label: 'the three features', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="class-theme-vote"]', label: 'a vote key per option', expectPresent: 18, maxPresent: 18, expectVisible: 18 },
		/* The vote for Ember is said in a word on its key, not by the lit key alone. */
		{ selector: '[data-testid="class-theme-mine"]', label: 'Your vote, on the one key voted for', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* A student never sees a teacher's controls. */
		{ selector: '[data-testid="settings-theme"]', label: 'the Settings card (a teacher surface)', expectPresent: 0 },
		{ selector: '[data-testid="class-theme-manage"]', label: 'the teacher link to the vote controls', expectPresent: 0 },
		/* Themed: Period 2 and Period 4. The FRC class has no votes and no
		   accent, so its key and card draw exactly as before. */
		{ selector: '[data-testid="class-icon-theme"]', label: 'a theme bar on each themed strip key (2 of 3)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '.class-card.themed', label: 'a themed edge on each themed card (2 of 3)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="class-card-badge"]', label: 'the badge on each themed card', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	contrast: [
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'the class name on the washed banner', min: 4.5 },
		{ selector: '[data-testid="harness-class"] .ct-banner .pane-meta', label: 'the code, period and teacher on the banner', min: 4.5 },
		{ selector: '[data-testid="class-theme-words"]', label: 'the theme in words', min: 4.5 },
		{ selector: '.ctp-hint', label: 'what a feature changes', min: 4.5 },
		{ selector: '[data-testid="class-theme-vote"] .ctp-word', label: 'an option word on its key', min: 4.5 },
		{ selector: '[data-testid="class-theme-count"]', label: 'a count on its key', min: 4.5 },
		{ selector: '[data-testid="class-theme-mine"]', label: 'Your vote, on a lit key', min: 4.5 }
	],
	/* THE PATTERN MOVES, AND ONLY WHEN MOTION IS WANTED (ledger 0360, R21):
	   the arrival drift on the pattern's own layer, gone entirely under
	   `reduce`, where the layer is the still frame. */
	motion: [
		{ selector: '[data-testid="class-banner-pattern"]', label: 'the pattern drift, gated behind no-preference', expect: 'gated' }
	],
	tapTargets: [
		{ selector: '[data-testid="class-theme-toggle"]', label: 'Class theme', min: 44 },
		{ selector: '[data-testid="class-theme-vote"]', label: 'a vote key', min: 44 },
		{ selector: '[data-testid="class-theme-withdraw"]', label: 'Take back my vote', min: 44 }
	],
	orderResult: [
		{
			label: 'the accent stripe, the strip bars and the card edges each clear 3:1 on their own ground',
			evaluate: GRAPHIC_PASS,
			expected: ['examined=5', 'allClear3=true']
		},
		{
			label: 'the vote registered: pressed, counted, announced, and the tie stayed with the earlier option',
			evaluate: `() => {
				const v = window.__themeVote || {};
				return ['pressed=' + v.pressed, 'count=' + v.count, 'banner=' + v.banner, 'said=' + v.said];
			}`,
			expected: ['pressed=true', 'count=2 votes', 'banner=ocean', 'said=Voted for Ember palette.']
		},
		{
			label: 'no student is named anywhere in the panel, only counts',
			evaluate: `() => {
				const text = document.querySelector('[data-testid="class-theme-panel"]').textContent;
				/* The fixture's voters are addresses; none may reach the panel. */
				return ['addresses=' + ['@', 'boscotech'].filter((n) => text.toLowerCase().includes(n)).length];
			}`,
			expected: ['addresses=0']
		}
	]
};
