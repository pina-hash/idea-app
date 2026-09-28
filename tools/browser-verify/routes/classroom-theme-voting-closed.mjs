/**
 * A CLOSED VOTE (decision 45), at 375 and 1440: every vote key is still there
 * and says why it does nothing -- `aria-disabled` with the closed sentence as
 * its description, never `disabled`, which would swallow the press and explain
 * nothing -- and a press changes no count. The open vote is the student spec.
 */
import { IGNORE, OPEN_PANEL, READY } from './_classroom-theme.mjs';

export default {
	path: '/dev/classroom-theme?voting=closed',
	label: 'Class theme, voting closed: the keys explain themselves and count nothing',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the class page has painted' },
		{ waitFor: `() => !!document.querySelector('[data-testid="class-theme-toggle"]')`, label: 'the panel read its tally' },
		OPEN_PANEL,
		{
			label: 'press an unpressed key while closed: nothing changes',
			evaluate: `async () => {
				const key = [...document.querySelectorAll('[data-testid="class-theme-feature"][data-feature="palette"] [data-testid="class-theme-vote"]')].find((b) => b.textContent.includes('Steel'));
				const before = key.querySelector('[data-testid="class-theme-count"]').textContent.trim();
				key.click();
				await new Promise((r) => setTimeout(r, 400));
				window.__closed = {
					before,
					after: key.querySelector('[data-testid="class-theme-count"]').textContent.trim(),
					pressed: key.getAttribute('aria-pressed'),
					disabled: key.getAttribute('aria-disabled'),
					described: !!document.getElementById(key.getAttribute('aria-describedby') || '-')
				};
				return JSON.stringify(window.__closed);
			}`
		}
	],
	presence: [
		{ selector: '[data-testid="class-theme-closed"]', label: 'the closed sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-theme-vote"][aria-disabled="true"]', label: 'every vote key, marked and still present', expectPresent: 18, maxPresent: 18, expectVisible: 18 },
		{ selector: '[data-testid="class-theme-vote"][disabled]', label: 'a genuinely disabled key (none: it must explain itself)', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="class-theme-words"]', label: 'the closed state is on the panel line too', must: ['Voting closed'] }
	],
	contrast: [{ selector: '[data-testid="class-theme-closed"]', label: 'the closed sentence', min: 4.5 }],
	orderResult: [
		{
			label: 'a press while closed counts nothing and presses nothing',
			evaluate: `() => { const c = window.__closed || {}; return ['same=' + (c.before === c.after), 'pressed=' + c.pressed, 'ariaDisabled=' + c.disabled, 'describedBy=' + c.described]; }`,
			expected: ['same=true', 'pressed=false', 'ariaDisabled=true', 'describedBy=true']
		}
	]
};
