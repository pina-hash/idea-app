/**
 * The Materials panel, at both widths, with the physics measured through the
 * controls themselves.
 *
 * WHY THIS IS A BROWSER CLAIM. Two halves, and neither can be asked anywhere
 * else in this repo.
 *
 *   * GEOMETRY. The panel REPLACES the feature tree in the same 300px pane, and
 *     the way that goes wrong is geometric rather than structural: a panel
 *     rendered BELOW the tree instead of instead of it looks almost right and
 *     passes every content check ever written about either half. happy-dom has
 *     no layout engine and reads every box as zero, so `tests/dom/` cannot tell
 *     the two apart at all.
 *
 *   * THE CONTROL ACTUALLY DRIVING THE READOUT. `tests/ideacad-materials-physics.test.ts`
 *     proves the ENGINE moves when the material does; what it cannot prove is
 *     that the select on screen is wired to the config the engine reads. A
 *     select that writes a stored id nobody evaluates looks identical and is the
 *     failure this whole bundle is exposed to -- so `__ideacadMaterialVerdicts`
 *     drives the real `<select>` elements and reads the Rules rail back.
 *
 * THE PANEL IS NOT IN THE RULES RAIL, AND THAT IS WHY THE RAIL IS STILL
 * CHECKED HERE. Ledger 0178 put the rail's content 40px over its box by adding
 * two rows, under a fold this container's Chromium draws no scrollbar for; it
 * sits at 502px in a 515px box now with 13px spare. This bundle adds four
 * controls and a form, all of them in the TREE pane, which scrolls -- so the
 * rail's last row is asserted visible in `__ideacadVerdicts` exactly as it was,
 * and this route inherits that claim rather than restating it.
 *
 * THE STATE IS REACHED THROUGH THE REAL CONTROL. `__ideacadOpenMaterials`
 * double-clicks the Materials node the FeatureManager has always carried, which
 * is exactly what a student does; `BladeEditor` has no `editing` prop and must
 * not gain one, or this file would be measuring an arrangement the surface has
 * no path to.
 *
 * TAP TARGETS ARE MEASURED WITH NO 24px EXCEPTION, as everywhere in IdeaCAD:
 * this is a student surface at every width and carries no instructor-density
 * class on its root.
 */
export default {
	path: '/dev/ideacad?role=student&state=materials',
	label: 'IdeaCAD: the Materials panel, its thickness list, and the physics moving with it',
	prepare: [
		{ waitFor: '() => typeof window.__ideacadMaterialVerdicts === "function"' },
		{ waitFor: '() => !!window.__ideacadCamera?.()' },
		{ evaluate: '() => window.__ideacadOpenMaterials()' },
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"ideacad-materials-panel\\"]")' }
	],
	orderResult: [
		{
			label: 'the panel replaced the tree in the tree’s own pane, and the controls drive the readouts',
			evaluate: '() => window.__ideacadMaterialVerdicts()',
			expected: [
				'the Materials panel is on screen ok',
				'it replaced the feature tree rather than joining it ok',
				'it is inside the pane the tree was in ok',
				'every control is inside that pane ok',
				'there are four choices: body material, blade material, blade thickness, spin ok',
				'the panel names the thickness rule in words ok',
				'nothing is wider than the window ok',
				'changing the body material changes the mass ok',
				'polycarbonate passes the mass rule at this geometry ok',
				'stainless steel fails it at the same geometry ok',
				'changing only the blade thickness changes the mass ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-materials-panel"]', label: 'the Materials panel', expectPresent: 1, expectVisible: 1 },
		/* The tree, ABSENT, with the panel above as the positive control that the
		   pane rendered something at all. "Replaced in place" is exactly this pair
		   of counts and cannot be asserted by either one alone. */
		{ selector: '.tree [role="tree"]', label: 'the FeatureManager list, replaced', expectPresent: 0 },
		{ selector: '.mat select', label: 'body material, blade material, blade thickness, spin', expectPresent: 4, expectVisible: 4 },
		{ selector: '.mat .slider', label: 'the body fill slider', expectPresent: 1, expectVisible: 1 },
		/* Two density lines, one per slot, each with its own UNVERIFIED chip on a
		   freshly seeded library. A count, because one line rendering twice and
		   one line missing look the same to a selector. */
		{ selector: '.mat .reading .fact', label: 'the body and blade density lines', expectPresent: 2, expectVisible: 2 },
		{ selector: '.mat .confirm button', label: 'the green check and the red X', expectPresent: 2, expectVisible: 2 },
		/* The custom layer's control, and the form CLOSED behind it: a form that
		   was open from the first frame would displace the four pickers this
		   panel exists for, in a pane whose fold this browser draws no scrollbar
		   for. */
		{ selector: '.mat .addown', label: 'Add my own material', expectPresent: 1, expectVisible: 1 },
		{ selector: '.mat #mat-own', label: 'the custom form, closed until asked for', expectPresent: 0 },
		/* ONE CONFIRM PAIR ON SCREEN, the same rule the PropertyManager follows:
		   two Accepts on a 1440px console, measured, with nothing saying which
		   one to press. */
		{ selector: 'footer button', label: 'the viewport’s confirm pair, withdrawn while the panel is up', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '.mat',
			label: 'the panel states the thickness rule and the UNVERIFIED density rather than leaving either to be discovered',
			must: [
				'Blade material',
				'Blade thickness',
				'You pick one; you do not get to type a number',
				'g/cm³',
				/* The retired material the default tree opens on, OFFERED and
				   MARKED. A panel that dropped it would leave a student on a
				   material its own picker does not list. */
				'(retired)',
				'UNVERIFIED'
			],
			/* The retired PLA row the default tree opens on: it has to be OFFERED
			   and MARKED, which is the whole retirement argument on screen. A
			   panel that dropped it would leave a student on a material the
			   picker does not list. */
			mustNot: ['NaN', 'undefined']
		}
	],
	contrast: [
		{ selector: '.mat h3', label: 'the panel heading on the pane ground', min: 4.5 },
		{ selector: '.mat .lab', label: 'a control label', min: 4.5 },
		{ selector: '.mat .fact', label: 'the density readout beside a picker', min: 4.5 },
		{ selector: '.mat .note', label: 'the panel’s own prose', min: 4.5 },
		/* The UNVERIFIED chip, which is the one mark on this panel that is a
		   claim about the number beside it rather than a label. It is `--copper`
		   on the pane ground and is the thing a student is meant to notice. */
		{ selector: '.mat .chip', label: 'the UNVERIFIED chip beside a density', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.mat select', label: 'a material or thickness picker' },
		{ selector: '.mat .confirm button', label: 'the confirm pair' },
		{ selector: '.mat .back', label: 'the way back to the tree' },
		{ selector: '.mat .addown', label: 'Add my own material' },
		{ selector: '.mat .slider', label: 'the body fill slider' }
	]
};
