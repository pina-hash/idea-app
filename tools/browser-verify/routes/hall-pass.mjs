// original array position 15 of 25 -- see ../README.md for what `order` means
export const order = 15;

export default {
	path: '/dev/hall-pass',
	label: 'Hall pass, all five projections + the 0144 close branch',
	/*
		THE ONE CONTROL THIS FEATURE HAS, and until now it had never been
		measured anywhere. 0143 shipped the hall pass with no harness; the
		route's own header says so in as many words and asks whoever owns
		`tools/` to list it. This is that listing.

		WHY IT MATTERS MORE THAN ITS SIZE SUGGESTS: it is a PHONE control on
		a student surface -- one-handed, at the top of the class pane, at the
		one moment a student is not going to read anything -- and it is
		`aria-disabled` rather than `disabled` on purpose, so a student who
		taps a taken pass gets a sentence instead of a dead button. Both of
		those are invisible to `svelte-check` and neither shows up as wrong
		on screen: a `disabled` attribute renders identically and simply eats
		the tap.

		CONFIRMED HERE, NOT COPIED. The bundle that added the route
		hand-measured 44.0px min dimension, hit fraction 1.0 and 0px overflow
		at both widths. Re-measured through this harness: min dim 44.0px over
		4 controls, 4/4 centre hit tests land on the control itself, 0px
		overflow at 375 and 1440. The hand numbers reproduce exactly.
	*/
	presence: [
		/* SIX MOUNTS: the five payload projections plus the read-only one. */
		{ selector: '[data-testid="hall-pass"]', label: 'hall pass mounts (5 projections + read-only)', expectPresent: 6 },
		/*
			ABSENCE IS THE MECHANISM, and this is the assertion for it. The
			sixth mount is handed `transports={null}`, so the whole actions
			block is not rendered -- 5 `.hp-actions`, never 6. A read-only
			surface with a flag somebody honours would show 6 here.

			PRESENT 5 BUT VISIBLE 4, MEASURED, and the gap is the sixth
			projection rather than a defect: an instructor with NOBODY OUT has
			a `transports` object (so the block renders) and nothing to press
			(`canClose` is false, and the Sign-out branch is student-only), so
			that mount's block is a real zero-box -- 309.0x0.0 at 375px,
			638.0x0.0 at 1440. Asserting visible 5 here would be asserting a
			control the component is right not to offer. The numbers are split
			deliberately: `present` says the read-only mount rendered nothing,
			`visible` says exactly one of the five holds no control.
		*/
		{ selector: '.hp-actions', label: 'action blocks (read-only renders none; manager-empty renders an empty one)', expectPresent: 5, expectVisible: 4 },
		/*
			THE aria-disabled CONTRACT, ASSERTED IN BOTH DIRECTIONS. The
			blocked student's control must carry `aria-disabled="true"` so it
			can still receive the tap and explain itself, and NOTHING here may
			carry a real `disabled` attribute -- that swallows the pointer
			event and takes the explanation with it. The second row is the one
			that bites: a `disabled` added "to be consistent" looks correct in
			every screenshot.
		*/
		{ selector: '[data-mount="student-blocked"] [data-testid="hall-pass-open"][aria-disabled="true"]', label: 'blocked control is aria-disabled', expectPresent: 1 },
		{ selector: '[data-testid="hall-pass-open"][disabled], [data-testid="hall-pass-close"][disabled]', label: 'no control carries a real disabled attribute', expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '[data-testid="hall-pass-status"]', label: 'status line', min: 4.5 },
		/* `--ice` on the blocked control: a boundary-weight signal on a
		   control, not body copy, so 3:1 is the floor that applies. */
		{ selector: '[data-mount="student-blocked"] [data-testid="hall-pass-open"]', label: 'blocked control ink (--ice)', min: 3 }
	],
	tapTargets: [
		{ selector: '[data-testid="hall-pass-open"], [data-testid="hall-pass-close"]', label: 'hall pass controls (phone-first, 44px)', min: 44 }
	],
	/*
		THE 0144 BRANCH, WHICH IS THE HALF `svelte-check` CANNOT SEE AND THE
		SCREEN DOES NOT SHOW. `signIn()` sends the PASS ID when the payload is
		a manager's and the SECTION when it is a student's -- one button, one
		label, two different requests. The defect it replaced was a
		section-keyed close that re-resolved "whatever is open in this
		section" server-side, so a clear pressed while one student returned
		and another left closed the SECOND student's pass and marked them back
		in the room while they were in a corridor.

		So this is a claim about a WRITE, which is exactly what `orderResult`
		exists for and what no DOM read can settle: the button looks identical
		either way. The prepare steps press the manager's control and then the
		student's; the harness's transports record which METHOD each press
		called, and the evaluate below projects the log down to just the
		method names. The expected pair is 0144's rule, not the fixture's
		prose -- reformatting a log line must not move this assertion, and
		taking the wrong branch must.
	*/
	prepare: [
		{
			click: '[data-mount="manager-open"] [data-testid="hall-pass-close"]',
			until: '() => document.querySelectorAll(\'[data-testid="hall-pass-log"] li\').length >= 1'
		},
		{
			click: '[data-mount="student-mine"] [data-testid="hall-pass-close"]',
			until: '() => document.querySelectorAll(\'[data-testid="hall-pass-log"] li\').length >= 2'
		}
	],
	orderResult: [
		{
			evaluate:
				'() => [...document.querySelectorAll(\'[data-testid="hall-pass-log"] li\')].map((li) => (li.textContent.match(/(closeById|closeMine|open)\\(/) || [])[1] ?? "?")',
			expected: ['closeById', 'closeMine'],
			label: "the manager's close named the PASS, the student's named nothing"
		}
	]
};
