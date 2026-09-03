export default {
	path: '/dev/instructor-tools?tool=picker',
	label: 'The picker: a drawn set of teams, an order, and one student',
	aliasOf: '/dev/instructor-tools',
	/*
		A DRAW, DRIVEN. The picker's whole design claim is that a draw survives a
		re-render, so this presses Draw and then forces a re-render (marking a
		student absent and back) and asserts the teams did NOT move.

		THAT IS THE PROPERTY THAT FAILS SILENTLY. An unseeded shuffle re-rolls on
		every re-render and nothing on screen looks wrong -- just different --
		which is exactly how a teacher reads out team three and then loses it.
	*/
	prepare: [
		{
			click: '[data-testid="tool-picker"]',
			until: '() => !!document.querySelector("[data-testid=\'picker-panel\']")'
		},
		{
			click: '[data-testid="picker-draw"]',
			until: '() => !!document.querySelector("[data-testid=\'picker-teams\']")'
		},
		{
			/* Stash the drawn teams BEFORE the re-render, so the comparison
			   below is against what was actually on screen rather than against
			   a second call to the same function. */
			evaluate: `() => {
				window.__drawn = [...document.querySelectorAll('[data-testid="picker-teams"] li')].map((li) => li.textContent);
				return 'captured ' + window.__drawn.length + ' names';
			}`
		},
		{
			/* A REAL RE-RENDER: an absence toggled off and straight back on
			   leaves the pool identical and forces the whole panel through the
			   reactive graph again. */
			click: '[data-testid="picker-present"]',
			until: '() => (document.querySelector("[data-testid=\'picker-note\']")?.textContent || "").includes("marked absent")'
		},
		{
			click: '[data-testid="picker-present"]',
			until: '() => !(document.querySelector("[data-testid=\'picker-note\']")?.textContent || "").includes("marked absent")'
		}
	],
	presence: [
		{ selector: '[data-testid="picker-teams"]', label: 'teams', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="picker-order"]', label: 'the order', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="picker-one"]', label: 'one student', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="picker-note"]', label: 'the draw note with the seed', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="email-panel"]', label: 'email panel (closed by opening the picker)', expectPresent: 0 }
	],
	orderResult: [
		{
			evaluate: `() => {
				const now = [...document.querySelectorAll('[data-testid="picker-teams"] li')].map((li) => li.textContent);
				return [String(now.length > 0), String(JSON.stringify(now) === JSON.stringify(window.__drawn || []))];
			}`,
			expected: ['true', 'true'],
			label: 'the draw is unchanged by a re-render, which an unseeded shuffle cannot manage'
		},
		{
			/* NOBODY ALONE, and everyone in exactly one team. 39 active students
			   in threes is 13 teams of 3 -- but the assertion is the property,
			   not the arithmetic, so it survives a fixture change. */
			evaluate: `() => {
				const teams = [...document.querySelectorAll('[data-testid="picker-teams"] .picker-team')];
				const sizes = teams.map((t) => t.querySelectorAll('li').length);
				const names = teams.flatMap((t) => [...t.querySelectorAll('li')].map((li) => li.textContent));
				return [
					String(teams.length > 1),
					String(Math.max(...sizes) - Math.min(...sizes) <= 1),
					String(new Set(names).size === names.length)
				];
			}`,
			expected: ['true', 'true', 'true'],
			label: 'teams are balanced within one, and nobody is on two of them'
		},
		{
			/* THE SEED IS ON SCREEN. Without it a shuffled list is
			   indistinguishable from an arranged one, which is the "make it
			   obvious it was random" half of the ask. */
			evaluate: `() => {
				const t = document.querySelector('[data-testid="picker-note"]')?.textContent || '';
				return [String(/seed [0-9a-f]{8}/.test(t)), String(t.includes('Random draw'))];
			}`,
			expected: ['true', 'true'],
			label: 'the note prints the seed, so the room can check the draw'
		}
	],
	tapTargets: [
		{ selector: '[data-testid="picker-draw"]', label: 'draw', min: 44 },
		{ selector: '[data-testid="picker-team-size"]', label: 'team size', min: 44 },
		{ selector: '.absent-item', label: 'the here-today checkboxes', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="picker-note"]', label: 'the draw note', min: 4.5 },
		{ selector: '[data-testid="picker-teams"] .picker-team li', label: 'a team member', min: 4.5 }
	]
};
