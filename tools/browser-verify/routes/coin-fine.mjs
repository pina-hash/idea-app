/**
 * THE FINE SCREEN (IDEA Coin V2), at rest: a class landed on, every student a
 * tile, and the hall pass card's warnings and fines beneath it.
 *
 * WHAT A SCREEN CANNOT SAY AND THESE ROWS DO:
 *  - The tiles are the whole roster (22 in the fake class) and each one is a
 *    phone target well past 44px; the name on it is the first name.
 *  - The two badges are a glyph AND a word, one each in the fake roster, so a
 *    colour-blind reader still has two signals.
 *  - The screen landed on the class IN SESSION, not the last one used (the
 *    harness hands it the other class as the last used): the picker's value
 *    says which.
 *  - Nothing is open at rest: no sheet, no dock.
 */
export default {
	path: '/dev/coin-fine',
	label: 'Coin V2 fine screen at rest, plus hall pass warnings and fines',
	prepare: [
		{
			waitFor: '() => document.querySelectorAll("[data-testid=\\"fine-tile\\"]").length === 22',
			timeoutMs: 15000
		}
	],
	presence: [
		{ selector: '[data-testid="fine-tile"]', label: 'one tile per student', expectPresent: 22, maxPresent: 22, expectVisible: 22 },
		{ selector: '[data-testid="fine-badge-pass"]', label: 'hall pass badge (glyph and word)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fine-badge-shop"]', label: 'no shop badge (glyph and word)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fine-sheet"]', label: 'no fine sheet at rest', expectPresent: 0 },
		{ selector: '[data-testid="fine-dock"]', label: 'no dock at rest', expectPresent: 0 },
		{ selector: '[data-testid="fine-in-session"]', label: 'the in-session chip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="hall-pass-events"]', label: 'warnings and fines lists (instructor and student)', expectPresent: 2, maxPresent: 2 }
	],
	textContains: [
		{ selector: '[data-testid="fine-badge-pass"]', label: 'the badge says its word', must: ['Hall pass'] },
		{ selector: '[data-testid="fine-badge-shop"]', label: 'the badge says its word', must: ['No shop'] },
		{ selector: '[data-mount="hall-student"] [data-testid="hall-pass-rule"]', label: 'the student is told the rule from the payload', must: ['10 minutes', '20 minutes'] }
	],
	orderResult: [
		{
			label: 'landed on the class in session, not the last used',
			evaluate: '() => [document.querySelector("[data-testid=\\"fine-section\\"]")?.value]',
			expected: ['11111111-aaaa-4aaa-8aaa-111111111111']
		},
		{
			label: 'the first tiles, alphabetically by first name (Ana Reyes and Ana Rios share "Ana R.", so each shows the whole name)',
			evaluate: '() => [...document.querySelectorAll("[data-testid=\\"fine-tile\\"] .fs-name")].slice(0, 3).map((n) => n.textContent.trim())',
			expected: ['Ana Reyes', 'Ana Rios', 'Ben']
		}
	],
	contrast: [
		{ selector: '[data-testid="fine-tile"] .fs-name', label: 'tile name', min: 4.5 },
		{ selector: '[data-testid="fine-tile"] .fs-bal:not(.is-neg)', label: 'tile balance', min: 4.5 },
		{ selector: '[data-testid="fine-tile"] .fs-bal.is-neg', label: 'tile balance below zero', min: 4.5 },
		{ selector: '[data-testid="fine-badge-pass"]', label: 'hall pass badge', min: 4.5 },
		{ selector: '[data-testid="fine-badge-shop"]', label: 'no shop badge', min: 4.5 },
		{ selector: '.fs-hint', label: 'the hint', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="fine-tile"]', label: 'student tiles', min: 64 },
		{ selector: '[data-testid="fine-multi"]', label: 'Pick several', min: 44 },
		{ selector: '[data-testid="fine-section"]', label: 'class picker', min: 44 }
	]
};
