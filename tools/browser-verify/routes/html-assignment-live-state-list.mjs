/**
 * THE ANSWERS LEFT LIST, OPEN (ledger 0431). Its rows are 44px buttons that
 * say what each answer still wants, grouped under the module title, and the
 * list never pushes the page wider than the screen at 375.
 */
export default {
	path: '/dev/html-assignment-live?state=list',
	aliasOf: '/dev/html-assignment-live',
	label: 'HTML assignment: the Answers left list, open',
	prepare: [
		{ waitFor: '() => window.__hxLive?.ready === true', attempts: 40, gapMs: 250 },
		{
			click: '.hxp [data-testid="hxp-mod-open"]',
			until: '() => !!document.querySelector(\'[data-testid="hx-answers-left-list"]\')'
		}
	],
	presence: [
		{ selector: '[data-testid="hx-answers-left-list"] button[data-hx-left-field]', label: 'one row per answer still owed', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="hx-answers-left-list"] [data-hx-left-field="teamName"]', label: 'no row for an answer already in', expectPresent: 0, maxPresent: 0 }
	],
	orderResult: [
		{
			/* THE CHIP OPENED THE LIST AT ITS MODULE: focus is on that module's
			   first owed answer, so a keyboard user lands where the chip pointed. */
			label: 'the chip opened the list with focus on its first owed answer',
			evaluate: `() => [document.activeElement?.getAttribute?.('data-hx-left-field') ?? 'focus on ' + (document.activeElement?.tagName ?? 'nothing')]`,
			expected: ['reflection']
		},
		{
			label: 'each row says what it still wants',
			evaluate: `() => [...document.querySelectorAll('[data-testid="hx-answers-left-list"] .hxl-want')].map((w) => w.textContent.trim())`,
			expected: ['Needs 2 sentences', 'Box to check']
		},
		{
			label: 'the open list fits the screen',
			evaluate: `() => [document.documentElement.scrollWidth <= innerWidth ? 'no horizontal scroll' : 'page is ' + document.documentElement.scrollWidth + ' wide']`,
			expected: ['no horizontal scroll']
		}
	],
	tapTargets: [{ selector: '[data-testid="hx-answers-left-list"] button[data-hx-left-field]', label: 'a row in the list', min: 44 }],
	contrast: [
		{ selector: '[data-testid="hx-answers-left-list"] .hxl-label', label: 'a row label', min: 4.5 },
		{ selector: '[data-testid="hx-answers-left-list"] .hxl-want', label: 'what a row still wants', min: 4.5 }
	]
};
