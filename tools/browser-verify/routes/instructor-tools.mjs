export default {
	path: '/dev/instructor-tools',
	label: 'Instructor tools: the hall pass refused by its limit, and the Class tools row',
	/*
		THE RESTING STATE. Three HallPass mounts and the People tab, before any
		tool panel is opened -- which is what an instructor actually sees, and
		is where the "no vertical clutter" claim is either true or not.

		THE ONE THAT NEEDS MEASURING IS THE REFUSAL. A hall pass blocked by
		0174's cooldown renders `aria-disabled` rather than `disabled`,
		deliberately: a genuinely disabled control swallows the tap and can
		never say why, and on the one control this feature has that is the whole
		surface going quiet. On screen the two are indistinguishable, and
		`svelte-check` cannot see the difference either -- so the attribute is
		asserted here, in both directions, against a mount that IS allowed to
		open in the same page.
	*/
	presence: [
		{ selector: '[data-testid="hall-pass"]', label: 'hall pass cards', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="hall-pass-usage"]', label: "the day's count, shown before any tap", expectPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="hall-pass-open"]', label: 'sign-out controls', expectPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="class-tools"]', label: 'the Class tools card', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tool-export"]', label: 'export roster', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tool-email"]', label: 'email the class', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tool-picker"]', label: 'random picker', expectPresent: 1, expectVisible: 1 },
		/*
			NOTHING IS OPEN AT REST, which is the placement argument made
			measurable: the card costs one heading and one row of controls on a
			page read standing up. Beside three positive rows above, so a
			renamed selector cannot pass as "the rule holds".
		*/
		{ selector: '[data-testid="email-panel"]', label: 'email panel (closed at rest)', expectPresent: 0 },
		{ selector: '[data-testid="picker-panel"]', label: 'picker panel (closed at rest)', expectPresent: 0 },
		{ selector: '[data-testid="picker-teams"]', label: 'teams (no draw yet)', expectPresent: 0 }
	],
	orderResult: [
		{
			/*
				THE ASSERTION THIS ROUTE EXISTS FOR. Two of the three student
				cards are refused by the limit and one is not, so `true` here
				cannot come from a component that disables everything -- and
				`disabled` is asserted absent on all three, because a control
				that cannot receive a tap cannot explain itself.
			*/
			evaluate: `() => [...document.querySelectorAll('[data-testid="hall-pass-open"]')]
				.map((b) => b.getAttribute('aria-disabled') + '/' + (b.hasAttribute('disabled') ? 'disabled' : 'live'))`,
			expected: ['false/live', 'true/live', 'true/live'],
			label: 'the refused passes are aria-disabled and never disabled, and one is still open'
		},
		{
			/* The refusal names a CLOCK TIME and the cap names a NUMBER. A
			   refusal with neither is the one this limit exists to avoid. */
			evaluate: `() => {
				const cards = [...document.querySelectorAll('[data-testid="hall-pass"]')];
				const text = cards.map((c) => c.textContent || '');
				return [
					String(text.some((t) => /1 of 3 passes used today/.test(t))),
					String(text.some((t) => /2 of 3 passes used today/.test(t))),
					String(text.some((t) => /3 of 3 passes used today/.test(t)))
				];
			}`,
			expected: ['true', 'true', 'true'],
			label: 'each mount states its own count from the payload, never a constant'
		}
	],
	tapTargets: [
		{ selector: '[data-testid="hall-pass-open"]', label: 'sign out', min: 44 },
		{ selector: '[data-testid="tool-export"]', label: 'export roster', min: 44 },
		{ selector: '[data-testid="tool-email"]', label: 'email the class', min: 44 },
		{ selector: '[data-testid="tool-picker"]', label: 'random picker', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="hall-pass-usage"]', label: "the day's count", min: 4.5 },
		{ selector: '[data-testid="hall-pass-status"]', label: 'the pass status line', min: 4.5 }
	]
};
