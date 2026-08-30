export default {
	path: '/dev/spec-importer?case=assignment',
	label: 'Spec importer, spec attached: the panel, the copy control and the seeded editor',
	/* THE ATTACHED-SPEC MOUNT, which is the one every classroom teacher meets.
	   Nothing in this repo drove `SpecImporter` in a browser until
	   `/dev/spec-importer` existed -- every surface that mounts it sits behind a
	   Google sign-in no automated run holds -- so the three things this spec
	   measures had never been measured anywhere.

	   `?case=assignment` renders ONE mount rather than the route's default four,
	   which is what lets a global selector below count 1 instead of 4. */
	prepare: [
		{
			/* THE SEEDED EDITOR, REACHED BY THE PRESS THAT OPENS IT. The `until`
			   is the paste box's existence, which is 0 AT REST (measured: the
			   import body is not rendered until `open`), so `clickUntil` cannot
			   short-circuit on a state the page already satisfies -- this step
			   is a real measurement of a real press, per `routes/README.md`. */
			click: '[data-testid="spec-open-editor"]',
			until: `() => !!document.querySelector('[data-testid="spec-paste"]')`,
			waitMs: 400
		}
	],
	presence: [
		/* THE MOUNT CONTROL. Every absence row below is only worth reading if the
		   component actually rendered; a spec whose selectors all matched nothing
		   would otherwise report a clean sweep of a blank page. */
		{ selector: '.importer', label: 'SpecImporter root', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.cr-root', label: 'classroom room wrapper (the room the component ships in)', expectPresent: 1, expectVisible: 1 },
		/* THE ATTACHED-SPEC PANEL. */
		{ selector: '.importer .spec-line', label: 'attached-spec line', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.importer .spec-line.none', label: 'the NO-spec line, which this mount must not show', expectPresent: 0 },
		/* THE COPY CONTROL, in the always-visible actions row rather than inside
		   the JSON panel -- reading the document and taking it are different
		   jobs. Its absence is the staging spec's assertion; this is the
		   positive half of that pair. */
		{ selector: '[data-testid="spec-copy"]', label: 'Copy JSON', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="spec-json-toggle"]', label: 'spec JSON disclosure trigger', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* HIDDEN IN CSS, NEVER REMOVED, which is the component's own documented
		   rule: the document prints, and reopening it costs nothing. Present 1
		   and visible 0 is the only pair that says that -- present 0 would be a
		   removal and visible 1 would be a panel nobody asked to open. */
		{ selector: '[data-testid="spec-json"]', label: 'stored JSON (collapsed, present but not painted)', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 },
		/* THE SEEDED EDITOR, after the prepare press. */
		{ selector: '[data-testid="spec-paste"]', label: 'editor box', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="spec-valid"]', label: 'valid line (the seeded document validates with no keystroke)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* AND NOTHING IS WRONG WITH IT. `spec-valid` above is this row's
		   positive control: a selector rename would take the valid line with it
		   and redden that row rather than leaving this one quietly at zero. */
		{ selector: '[data-testid="spec-problems"] li', label: 'problems reported against the seeded document', expectPresent: 0 },
		{ selector: '[data-testid="spec-preview"]', label: 'student preview', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			/* THE SEEDING IS THE STORED DOCUMENT, not a placeholder and not an
			   empty box. Asserted as [parses, title] rather than a character
			   count: a length is a number that moves whenever the fixture is
			   edited, and what matters is that the box came up holding THE spec. */
			label: 'seeded editor: [parses as JSON, meta.title]',
			evaluate: `() => {
				const ta = document.querySelector('[data-testid="spec-paste"]');
				try { return [true, JSON.parse(ta.value).meta.title]; }
				catch { return [false, null]; }
			}`,
			expected: [true, 'Bridge stackup']
		},
		{
			/* NOTHING SO FAR HAS REACHED THE SERVER. Opening the editor and
			   seeding it are local; the harness counts every transport call on
			   the page, so a seeding path that started writing shows up as a
			   number going to 1 rather than as nothing looking different. */
			label: 'transport calls after opening and seeding the editor',
			evaluate: `() => [Number(document.querySelector('[data-testid="write-count"]').dataset.writes)]`,
			expected: [0]
		}
	],
	textContains: [
		{
			selector: '.importer .spec-line',
			label: 'the attached line names the document',
			must: ['Interactive spec attached:', 'Bridge stackup'],
			/* The panel states what IS attached. "No interactive spec" is the
			   other branch's sentence and reaching it here would mean the
			   fixture stopped carrying a spec, which every row above would
			   still pass. */
			mustNot: ['No interactive spec', '--']
		}
	],
	contrast: [
		{ selector: '.importer .spec-line strong', label: 'attached document title', min: 4.5 },
		{ selector: '.importer .spec-meta', label: 'attached document meta', min: 4.5 },
		{ selector: '[data-testid="spec-valid"]', label: 'valid line', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="spec-json-toggle"]', label: 'JSON disclosure trigger', min: 44 },
		/* `.btn.tiny` CONTROLS, MEASURED AT 24px AND ASSERTED AT THE 24px FLOOR.
		   This is an instructor tool, and the floor CLAUDE.md sets everywhere
		   outside a student-facing surface is 24. The 44 these would take on a
		   phone is a property of the shared `.btn.tiny` rule rather than of this
		   component, so raising it here is an app-wide change and not this
		   spec's to assert into existence -- the same reading
		   `classroom-split-s-1-item-i-crowded-manage-1` and `short-links`
		   already take on their own chip rows. */
		{ selector: '[data-testid="spec-open-editor"]', label: 'Replace spec (24px floor, instructor tool)', min: 24 },
		{ selector: '[data-testid="spec-copy"]', label: 'Copy JSON (24px floor, instructor tool)', min: 24 },
		{ selector: '[data-testid="spec-publish"]', label: 'Publish (24px floor, instructor tool)', min: 24 }
	]
};
