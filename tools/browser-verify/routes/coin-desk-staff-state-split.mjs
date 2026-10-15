/**
 * THE FIRST TOURNAMENT SWITCHED TO "SPLIT": Gearheads' 10 among three members
 * (the walk-up counted, its share unpaid) is 3.34, 3.33 and 3.33, and the two
 * paid boxes show the first two. Transfer is armed and names the coins and
 * the students.
 */
export default {
	path: '/dev/coin-desk-staff-state-split',
	aliasOf: '/dev/coin-desk-staff?view=tournaments',
	label: 'Coin V2 tournament transfer, split chosen, Transfer armed',
	prepare: [
		{
			waitFor:
				'() => document.querySelector("[data-staff-hydrated=\\"true\\"]") && document.querySelectorAll("[data-testid=\\"cd-tournament\\"]").length === 2',
			timeoutMs: 20000
		},
		{
			click: '[data-testid="cd-tournament"]:first-of-type [data-testid="cd-tournament-mode"][data-mode="split"]',
			until:
				'() => document.querySelector("[data-testid=\\"cd-tournament\\"] [data-testid=\\"cd-tournament-mode\\"][data-mode=\\"split\\"]")?.getAttribute("aria-pressed") === "true"'
		},
		{
			click: '[data-testid="cd-tournament"]:first-of-type [data-testid="cd-tournament-transfer"]',
			until: '() => !!document.querySelector("[data-testid=\\"cd-tournament-ask\\"]")'
		}
	],
	orderResult: [
		{
			label: 'the first team’s two paid shares',
			evaluate:
				'() => [...document.querySelector("[data-testid=\\"cd-tournament-entry\\"]").querySelectorAll("[data-testid=\\"cd-tournament-amount\\"]")].map((i) => i.value)',
			expected: ['3.34', '3.33']
		}
	],
	presence: [
		{ selector: '[data-testid="cd-tournament-ask"]', label: 'the Transfer confirmation', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cd-tournament-confirm"]', label: 'one confirm key', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="cd-tournament-finished"]', label: 'nothing finished by the first press', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="cd-tournament-ask"]', label: 'names the students and the walk-up', must: ['3 students', '1 walk-up will not be paid'] }
	]
};
