/**
 * `ProfileMenu`'s trigger, measured where the hit test is real.
 *
 * WHY THIS ROUTE EXISTS AS A SPEC AT ALL. `ProfileMenu` is mounted in 69
 * product pages -- every classroom, notebook, GAUNTLET, Foundry, FRC,
 * tournaments, maps, coin-desk and admin page, plus the portal home -- and
 * until prompt 0023 nothing in this harness had ever measured it. 0023 put a
 * `.pm-trigger` row on `pathways.mjs`, which found the defect (34px against a
 * 44px floor) and reported it; prompt 0025 fixed it. This spec is the row that
 * keeps it fixed, and it is HERE rather than only there because of where the
 * control lands on each page.
 *
 * THE CHECK IS `tapReach`, NOT `tapTargets`, AND THE DIFFERENCE IS THE WHOLE
 * POINT OF THE FIX. `.tap-reach-44` deliberately leaves the PAINTED box at
 * 34px and grows the hit area with a centred `::after`, because this button is
 * a flex item of a masthead row that 69 pages size around and a taller box
 * would have moved all of their chrome. `tapTargets` measures the rendered box
 * and would therefore report a finding on a control that is fine -- which is
 * exactly what ../checks.mjs says in its own comment above `tapReach`. Pointing
 * the box check at a reach control is the documented way to get a permanent
 * false red.
 *
 * AND IT HIT-TESTS, WHICH IS THE HALF `pathways.mjs` CANNOT DO. On
 * `/dev/pathways` the ProfileMenu stage sits ~2261px down the page at 375 and
 * ~1660px down at 1440; `document.elementFromPoint` answers null outside the
 * viewport and this harness never scrolls, so all five of that row's sample
 * points come back `offscreen` and are excluded from the stolen-tap gate. The
 * geometry is still checked there and still reddens if the reach is removed.
 * But "does anything steal this tap" is only answerable where the control is on
 * screen, and on this page it is: measured 44/44 rows of the 44px band hitting
 * the trigger at both widths, with the reach's own left and right edges landing
 * on the button and not on a neighbour.
 *
 * `/dev/home-order` was the third route 0023 measured and is deliberately NOT
 * given a row: that page paints its own `div.harness-strip` across the top of
 * the viewport, which at 1440 covers y=3..28 and therefore the top 14px of the
 * trigger's PAINTED box as well as its reach. That is a property of the harness
 * page, not of the component -- it stole those taps before this fix existed --
 * and `home-order*.mjs` is owned by another lane.
 */
export default {
	path: '/dev/profile-menu',
	label: 'ProfileMenu trigger (the control on 69 product pages)',
	presence: [
		/* THE POSITIVE CONTROL. Every row below is about one element; without
		   this, a page that failed to mount the component would satisfy a
		   "nothing steals the tap" claim by having no tap to steal. */
		{ selector: '.pm-trigger', label: 'the trigger (positive control)', expectPresent: 1, maxPresent: 1 },
		/* THE PANEL IS SHUT AT REST, which is what makes the reach measurement
		   below a measurement of the closed control a student meets. */
		{ selector: '.pm-panel', label: 'the panel is closed until pressed', expectPresent: 0, expectVisible: 0 }
	],
	tapReach: [{ selector: '.pm-trigger', label: 'ProfileMenu trigger reach', min: 44 }],
	orderResult: [
		{
			/* THE PAINTED BOX MUST NOT HAVE GROWN, and this is the row that says
			   so. The fix is only correct if it left the masthead alone: a
			   `min-height: 44px` on `.pm-trigger` would satisfy the reach row
			   above just as well and would silently make the header of 69 pages
			   10px taller. Measured 34.0px before the fix and 34.0px after, at
			   both widths, on all three routes that mount the component.

			   It reads the box to ONE DECIMAL and compares a string, because the
			   number is the claim. A tolerance here would let the box drift a
			   pixel at a time with nothing reporting it. */
			label: 'the painted box is still 34px tall, and the reach is what grew',
			evaluate:
				'() => { const el = document.querySelector(".pm-trigger"); if (!el) return ["NO TRIGGER"]; const r = el.getBoundingClientRect(); const after = getComputedStyle(el, "::after"); return [r.height.toFixed(1), after.content !== "none" && after.content !== "" ? "reach present" : "NO REACH"]; }',
			expected: ['34.0', 'reach present']
		},
		{
			/* THE REACH GROWS IN HEIGHT ONLY. `--tap-reach-w: 0px` is what holds
			   it to the control's own width; without it the default is
			   `max(100%, 44px)`, which on the 44.0px-wide trigger that
			   /dev/pathways renders would push the pseudo-element out over
			   whatever the masthead puts beside it. Width was never the failing
			   dimension, so growing it can only cost a neighbour's tap.

			   Asserted from the COMPUTED custom property rather than from the
			   source, so a component that stopped declaring it reddens here even
			   though the class is still in the markup. */
			label: 'the reach is height-only (the documented width knob is set)',
			evaluate:
				'() => { const el = document.querySelector(".pm-trigger"); if (!el) return ["NO TRIGGER"]; return [getComputedStyle(el).getPropertyValue("--tap-reach-w").trim() || "UNSET"]; }',
			expected: ['0px']
		}
	]
};
