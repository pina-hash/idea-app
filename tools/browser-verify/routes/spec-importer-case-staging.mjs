export default {
	path: '/dev/spec-importer?case=staging',
	label: 'Spec importer, staging mode: no attached panel, no copy control, nothing reaches a server',
	/* THE COMPOSER'S OWN MOUNT: `itemId` null, no transports at all, the JSON
	   handed back through `onstage`. It is the shape where ABSENCE is the
	   mechanism -- there is no item to read a stored document off, so the
	   attached-spec panel and the copy control are not rendered rather than
	   rendered-and-disabled, and there is no transport object for a press to
	   reach even if one tried.

	   THIS SPEC IS THE OTHER HALF OF A PAIR. `spec-importer-case-assignment`
	   asserts the same three selectors PRESENT on the mount that has a document;
	   suppressing them everywhere reddens that spec, and rendering them
	   everywhere reddens this one. Neither file can go quietly green on a
	   renamed selector on its own. */
	presence: [
		/* THE MOUNT CONTROLS, and they are what make every zero below readable.
		   `.importer` says the component rendered; `.spec-line.none` says it
		   rendered its NO-DOCUMENT branch specifically (not that it failed
		   halfway); `spec-open-editor` says the actions row is on the page, so a
		   zero for the copy control beside it is a control that is absent rather
		   than a row that never drew. */
		{ selector: '.importer', label: 'SpecImporter root', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.cr-root', label: 'classroom room wrapper (the room the component ships in)', expectPresent: 1, expectVisible: 1 },
		{ selector: '.importer .spec-line.none', label: 'the no-document line', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="spec-open-editor"]', label: 'Import spec (the actions row is present)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE ABSENCES. Every one is an equality: a floor of zero asserts
		   nothing, so `expectPresent: 0` carries `maxPresent: 0` with it (see
		   `routes/README.md`). */
		{ selector: '.importer .spec-line:not(.none)', label: 'attached-spec panel line', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="spec-copy"]', label: 'Copy JSON', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="spec-json-toggle"]', label: 'spec JSON disclosure trigger', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="spec-json"]', label: 'stored JSON', expectPresent: 0, maxPresent: 0 },
		{ selector: '.importer .btn.danger', label: 'Remove spec', expectPresent: 0, maxPresent: 0 }
	],
	orderResult: [
		{
			/* NOTHING HERE MAY REACH A SERVER, and "nothing looked different" is
			   not a verification of that. The harness counts every transport call
			   the page makes; staging mode is handed no transports at all, so the
			   only honest number is zero and a guard that stopped guarding shows
			   up as a 1. */
			label: 'transport calls on the staging mount',
			evaluate: `() => [Number(document.querySelector('[data-testid="write-count"]').dataset.writes)]`,
			expected: [0]
		},
		{
			/* AND THE ABSENCE IS THE STAGING MOUNT'S, NOT THE WHOLE ROUTE'S. One
			   case is rendered, and it is the staging one -- without this, a
			   `?case=` that stopped being read would render all four mounts, the
			   attached panel would be on the page, and every zero above would
			   redden for a reason nobody could name from the report. */
			label: 'cases rendered, and which',
			evaluate: `() => {
				const cases = [...document.querySelectorAll('.case')].map((e) => e.dataset.case);
				return [cases.length, cases.join(',')];
			}`,
			expected: [1, 'staging']
		}
	],
	textContains: [
		{
			selector: '.importer .spec-line.none',
			label: 'the no-document line says what students get instead',
			must: ['No interactive spec.', 'plain file hand-in'],
			/* The other branch's word. A line that gained it would mean the
			   staging mount started claiming an attachment it cannot have. */
			mustNot: ['attached', '--']
		}
	],
	contrast: [{ selector: '.importer .spec-line.none', label: 'no-document line', min: 4.5 }],
	tapTargets: [
		/* See the sibling spec for why 24 and not 44 on a `.btn.tiny`. */
		{ selector: '[data-testid="spec-open-editor"]', label: 'Import spec (24px floor, instructor tool)', min: 24 }
	]
};
