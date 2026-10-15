/**
 * THE FINE SCREEN WITH ONE STUDENT TAPPED: the sheet of fines is open, which
 * is tap two. The eleven default fine buttons in the settings' own order, each
 * a phone target, each with its name and amount, and the Award door below.
 */
export default {
	path: '/dev/coin-fine-state-sheet',
	aliasOf: '/dev/coin-fine',
	label: 'Coin V2 fine screen, a student tapped, the fines open',
	prepare: [
		{
			waitFor: '() => document.querySelectorAll("[data-testid=\\"fine-tile\\"]").length === 22',
			timeoutMs: 15000
		},
		{
			evaluate: '() => { document.querySelectorAll("[data-testid=\\"fine-tile\\"]")[2]?.click(); return true; }',
			until: '() => !!document.querySelector("[data-testid=\\"fine-sheet\\"][open]")',
			attempts: 8,
			gapMs: 400
		}
	],
	presence: [
		{ selector: '[data-testid="fine-sheet"]', label: 'the fine sheet is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fine-button"]', label: 'the eleven default fine buttons', expectPresent: 11, maxPresent: 11, expectVisible: 11 },
		{ selector: '[data-testid="fine-award"]', label: 'the Award door', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'the buttons keep the settings order',
			evaluate: '() => [...document.querySelectorAll("[data-testid=\\"fine-button\\"]")].map((b) => b.dataset.category)',
			expected: [
				'shop_safety_violation',
				'coin_theft',
				'classmate_trust_violation',
				'eating_violation',
				'leaving_without_permission',
				'property_damage',
				'disruptive_behavior',
				'printer_not_reset',
				'off_task_device_use',
				'inappropriate_screen_content',
				'classroom_standards_violation'
			]
		}
	],
	contrast: [
		{ selector: '[data-testid="fine-button"] .fs-fine-name', label: 'fine name', min: 4.5 },
		{ selector: '[data-testid="fine-button"] .fs-fine-amount', label: 'fine amount', min: 4.5 },
		{ selector: '[data-testid="fine-sheet-who"] .fs-sheet-name', label: 'who the fine is for', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="fine-button"]', label: 'fine buttons', min: 44 },
		{ selector: '[data-testid="fine-sheet-close"]', label: 'Close', min: 44 },
		{ selector: '[data-testid="fine-award"]', label: 'Award', min: 44 }
	]
};
