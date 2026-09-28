/**
 * CLASS THEMES AS THE CLASS'S TEACHER SEES THEM (decision 45), at 375 and 1440.
 *
 * The teacher sees the same counts and NO vote keys (the database refuses a
 * teacher's vote, so a control whose only answer is a refusal is not offered),
 * a link to where the vote is run, and on the Settings card: this block's own
 * colour, voting open or closed, and a reset that says before the press what
 * it does. The negative control for the vote keys is the student spec.
 */
import { GRAPHIC_PASS, IGNORE, OPEN_PANEL, READY } from './_classroom-theme.mjs';

export default {
	path: '/dev/classroom-theme?role=teacher',
	label: 'Class theme, teacher: the counts without vote keys, and the Settings card',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the class page and the three class cards have painted' },
		{ waitFor: `() => !!document.querySelector('[data-testid="settings-theme"]') && !!document.querySelector('[data-testid="class-theme-toggle"]')`, label: 'the Settings card and the panel read their tally' },
		OPEN_PANEL,
		{
			click: '[data-testid="settings-reset"]',
			until: `() => !!document.querySelector('[data-testid="settings-reset-note"]')`,
			label: 'Reset the vote is armed, and says what it does before the second press'
		},
		{
			label: 'set this block to Rose: the strip key and the card repaint from one read',
			evaluate: `async () => {
				const rose = document.querySelector('[data-testid="settings-accent"][data-accent="rose"]');
				rose.click();
				for (let i = 0; i < 40; i++) {
					if (rose.getAttribute('aria-pressed') === 'true') break;
					await new Promise((r) => setTimeout(r, 50));
				}
				await new Promise((r) => setTimeout(r, 150));
				window.__accent = {
					pressed: rose.getAttribute('aria-pressed'),
					banner: document.querySelector('[data-testid="class-banner"]')?.dataset.accent,
					msg: document.querySelector('[data-testid="settings-theme-msg"]').textContent.trim()
				};
				return JSON.stringify(window.__accent);
			}`
		}
	],
	presence: [
		{ selector: '[data-testid="class-banner"]', label: 'the class banner', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-theme-feature"]', label: 'the three features, as counts', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="class-theme-row"]', label: 'a count row per option', expectPresent: 18, maxPresent: 18, expectVisible: 18 },
		{ selector: '[data-testid="class-theme-vote"]', label: 'vote keys (a teacher has none)', expectPresent: 0 },
		{ selector: '[data-testid="class-theme-withdraw"]', label: 'take-back keys (a teacher has none)', expectPresent: 0 },
		{ selector: '[data-testid="class-theme-manage"]', label: 'the link to where the vote is run', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-theme"]', label: 'the Settings theme card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-accent"]', label: 'No color and the six block colors', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="settings-voting-toggle"]', label: 'open or close voting', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-reset-confirm"]', label: 'the second press of the reset', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="settings-reset-note"]',
			label: 'the reset says, before the press, whose votes stop counting, that block colors stay, and that nothing is deleted',
			must: ['people who have voted stop counting', "Each block's own color stays", 'Nothing is deleted']
		}
	],
	contrast: [
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'the class name on the washed banner', min: 4.5 },
		{ selector: '[data-testid="class-theme-count"]', label: 'a count', min: 4.5 },
		{ selector: '[data-testid="settings-voting-state"]', label: 'the voting state sentence', min: 4.5 },
		{ selector: '[data-testid="settings-accent"]', label: 'a block color word', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="settings-accent"]', label: 'a block color', min: 44 },
		{ selector: '[data-testid="settings-voting-toggle"]', label: 'Close voting', min: 44 },
		{ selector: '[data-testid="settings-reset-confirm"]', label: 'Reset', min: 44 },
		{ selector: '[data-testid="settings-reset-cancel"]', label: 'Keep the votes', min: 44 },
		{ selector: '[data-testid="class-theme-manage"]', label: 'Open or close voting', min: 44 }
	],
	orderResult: [
		{
			label: 'the edges clear 3:1 on their own ground',
			evaluate: GRAPHIC_PASS,
			expected: ['examined=5', 'allClear3=true']
		},
		{
			label: 'picking Rose presses it and says so in words',
			evaluate: `() => { const a = window.__accent || {}; return ['pressed=' + a.pressed, 'msg=' + a.msg]; }`,
			expected: ['pressed=true', "msg=This block's color is now Rose."]
		}
	]
};
