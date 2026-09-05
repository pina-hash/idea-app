export default {
	path: '/dev/grading-incomplete?state=exports',
	label: 'Grading console: the three graded-work exports actually produced, both ways on identity',
	aliasOf: '/dev/grading-incomplete',
	/*
		THE STATE THIS ROUTE EXISTS FOR: four real files, produced by pressing the
		controls a teacher presses.

		THE HARNESS INTERCEPTS THE DOWNLOAD rather than simulating one -- it wraps
		`URL.createObjectURL` to keep the Blob (the console revokes the url on the
		very next line) and the anchor's own `click` to record the pair -- so every
		row measured below came out of `buildGradingExport` through the console's
		own download helper. A harness that rebuilt the payload itself would be
		asserting the builder against the builder.

		THE IDENTITY SWITCH IS MEASURED IN BOTH DIRECTIONS, AND EACH IS THE
		OTHER'S POSITIVE CONTROL. Steps 2 to 4 export with names in; step 5 flips
		the switch and step 6 exports the SAME scope again. "No name found" in the
		second file means something only because the first file, same fixture same
		selector, does contain one.
	*/
	prepare: [
		{
			/* THE ROSTER LANDS ASYNCHRONOUSLY (`loadGrading`, deferred out of the
			   effect body), so the first press has to wait for it. Without this
			   the 375px run clicked a roster that did not exist yet, reported
			   "0 matched" on four steps, and then hammered the one control that
			   did exist. A `waitFor` is the right shape here rather than a
			   `waitMs`: it is the payload landing, not an animation. */
			waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 5'
		},
		{
			/* Scope 1 needs a selection, and the console says so rather than
			   offering a control whose only outcome is a refusal. */
			click: '.roster-list li:first-child .roster-row',
			until: '() => !!document.querySelector(".console.split")'
		},
		{
			click: '[data-testid="export-json-student"]',
			until: '() => document.querySelectorAll("[data-testid=\'capture-row\']").length === 1'
		},
		{
			click: '[data-testid="export-json-class"]',
			until: '() => document.querySelectorAll("[data-testid=\'capture-row\']").length === 2'
		},
		{
			/* The workbook is built through `CompressionStream`, so it lands a
			   microtask or two later than the two JSON files. */
			click: '[data-testid="export-workbook"]',
			until: '() => document.querySelectorAll("[data-testid=\'capture-row\']").length === 3'
		},
		{
			/* `force`, because the predicate is about the note's WORDING and a
			   checkbox click is not something `clickUntil` can short-circuit
			   safely: the resting state already fails the predicate, but the
			   control is an input inside a label and the press must actually
			   land on it. */
			click: '[data-testid="export-identity"] input',
			force: true,
			until: '() => document.querySelector("[data-testid=\'export-identity-note\']")?.textContent.includes("NOT in this file") === true'
		},
		{
			click: '[data-testid="export-json-class"]',
			until: '() => document.querySelectorAll("[data-testid=\'capture-row\']").length === 4'
		}
	],
	presence: [
		{ selector: '[data-testid="capture-row"]', label: 'files the controls produced', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="export-note"]', label: 'the confirmation, where the person was working', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="capture-empty"]', label: 'the nothing-exported-yet line (now replaced)', expectPresent: 0 }
	],
	contrast: [{ selector: '[data-testid="export-note"]', label: 'the confirmation sentence', min: 4.5 }],
	textContains: [
		{
			selector: '[data-testid="export-identity-note"]',
			label: 'the switch, flipped, says the other thing',
			must: ['NOT in this file', 'Student 1'],
			mustNot: ['ARE included in this file']
		},
		{
			selector: '[data-testid="export-note"]',
			label: 'the confirmation says how many and whether names went with them',
			must: ['left out']
		}
	],
	orderResult: [
		{
			/* NEWEST FIRST. Four presses, four files, and the names say what each
			   one is without opening it -- including `-anon` on the one with no
			   names in it, which is what stops the two class exports being
			   indistinguishable in a downloads folder. */
			evaluate: `() => [...document.querySelectorAll('[data-testid="capture-row"]')].map((r) => r.dataset.name)`,
			expected: [
				'graded-bridge-sketch-worksheet-idea100-period-1-block-1-class-anon.json',
				'graded-bridge-sketch-worksheet-idea100-period-1-block-1-class.xlsx',
				'graded-bridge-sketch-worksheet-idea100-period-1-block-1-class.json',
				'graded-bridge-sketch-worksheet-idea100-period-1-block-1-student-1.json'
			],
			label: 'each scope produced a file, named for what it is'
		},
		{
			/* THE IDENTITY SWITCH, BOTH WAYS, READ OUT OF THE PRODUCED BYTES.
			   `true` on the two named exports is what makes `false` on the
			   anonymous one mean something. The workbook is a zip, so its bytes
			   are not searched here and it says so; the unit test inflates it
			   and asserts the same claim properly. */
			evaluate: `() => [...document.querySelectorAll('[data-testid="capture-row"]')].map((r) => r.dataset.name.split('-').slice(-1)[0] + ':' + (r.dataset.hasname ?? 'not-read'))`,
			expected: ['anon.json:false', 'class.xlsx:not-read', 'class.json:true', '1.json:true'],
			label: 'a name is in the file when the switch is on and in none of it when it is off'
		},
		{
			/* THE COUNT IN THE FILE AGAINST THE COUNT ON SCREEN. The roster rows
			   are what the console shows; `students` is parsed back out of the
			   downloaded JSON, never read off the builder. Scope 1 is 1 of them
			   and scope 2 is all of them. */
			evaluate: `() => {
				const roster = document.querySelectorAll('.roster-list .roster-row').length;
				const rows = [...document.querySelectorAll('[data-testid="capture-row"]')];
				const json = rows.filter((r) => r.dataset.students !== '' && r.dataset.students != null);
				return [roster, ...json.map((r) => Number(r.dataset.students))];
			}`,
			expected: [5, 5, 5, 1],
			label: 'the student count in every file matches the roster the console is showing'
		},
		{
			/* AND THE UNMET CHECKS. The left number is the console's own chips
			   summed off the screen; the right is the total parsed back out of
			   the class JSON. Ben 6, Carla 1, Eli 2 -- Alice met everything and
			   Dara never handed in, so neither carries the mark. */
			evaluate: `() => {
				const onScreen = [...document.querySelectorAll('[data-testid="roster-incomplete"]')]
					.reduce((n, el) => n + Number(el.textContent.replace(/\\D+/g, '')), 0);
				const inFile = [...document.querySelectorAll('[data-testid="capture-row"]')]
					.filter((r) => r.dataset.name.endsWith('class.json'))
					.map((r) => Number(r.dataset.unmet))[0];
				return [onScreen, inFile];
			}`,
			expected: [9, 9],
			label: 'the unmet checks in the file are the ones the console renders'
		},
		{
			/* ABSENCE IS INFORMATION. Dara handed in nothing at all, and a class
			   export that quietly listed four of five students would read as a
			   class of four. Read out of the produced file: present, labelled,
			   with an empty submission. */
			evaluate: `() => {
				const row = [...document.querySelectorAll('[data-testid="capture-row"]')]
					.find((r) => r.dataset.name.endsWith('class-anon.json'));
				const oracle = document.querySelector('[data-testid="export-oracle-row"][data-identity="omitted"]');
				return [Number(row?.dataset.students), Number(oracle?.dataset.empty)];
			}`,
			/* 5 students in the file, and Dara -- the one who never handed in --
			   is present carrying an empty submission record rather than being
			   dropped. The other four all handed in, which is why the second
			   number is 1 and not 2: Eli's row is RETURNED, not empty. */
			expected: [5, 1],
			label: 'a student who handed in nothing is in the file, as an empty record'
		},
		{
			/* THE SPREADSHEET IS A REAL WORKBOOK, not an empty file with a
			   convincing name. The harness INFLATES the captured bytes through
			   `$lib/xlsx-read` -- the same reader the vitest suite uses -- so
			   every figure below is read out of the produced file. */
			evaluate: `() => {
				const row = [...document.querySelectorAll('[data-testid="capture-row"]')]
					.find((r) => r.dataset.name.endsWith('.xlsx'));
				return [row ? Number(row.dataset.size) > 2000 : false];
			}`,
			expected: [true],
			label: 'the spreadsheet is real bytes, not an empty file with a name'
		},
		{
			/* ONE SHEET PER TABLE BLOCK, named from the block's own module, in
			   among the five fixed sheets. Two table blocks in this fixture, so
			   two sheets: `Three Views` and `Design Reflection`. */
			evaluate: `() => {
				const row = [...document.querySelectorAll('[data-testid="capture-row"]')]
					.find((r) => r.dataset.name.endsWith('.xlsx'));
				return (row?.dataset.sheets ?? '').split(' | ');
			}`,
			expected: [
				'Grades',
				'Unmet checks',
				'Responses',
				'Three Views',
				'Design Reflection',
				'Files',
				'About this export'
			],
			label: 'the workbook has one sheet per table block, read out of its own bytes'
		},
		{
			/* THE DEFECT THIS BUNDLE FIXES, MEASURED. A table used to be one
			   string in one cell, labels and values joined by pipes. This is the
			   header row of the `Design Reflection` sheet, inflated from the
			   file: the table's own columns, as real columns, behind the
			   identity columns every sheet leads with. */
			evaluate: `() => {
				const row = [...document.querySelectorAll('[data-testid="capture-row"]')]
					.find((r) => r.dataset.name.endsWith('.xlsx'));
				return (row?.dataset.tableheader ?? '').split(' | ');
			}`,
			expected: ['Student', 'Name', 'Row', 'Component', 'What you selected', 'Why it clears'],
			label: 'a table block\'s columns are real columns'
		},
		{
			/* THE ROW COUNT AND THE BLANK-ROW DROP, both out of the file.
			   `t2` holds three stored rows for Alice and two for Carla; one of
			   each is entirely blank, and `t1` carries a blank trailing row too,
			   so three rows are dropped and three survive on this sheet. The
			   partly filled row ("Speed Reduction", no justification) is real
			   work and is one of the three. */
			evaluate: `() => {
				const row = [...document.querySelectorAll('[data-testid="capture-row"]')]
					.find((r) => r.dataset.name.endsWith('.xlsx'));
				return [Number(row?.dataset.tablerows), (row?.dataset.blankdropped ?? '').split(' ')[0]];
			}`,
			expected: [3, '3'],
			label: 'a table row is a real row, and every all-blank row was dropped'
		},
		{
			/* NO ROW RUNS AWAY. The paragraph cell is what would have made one
			   five hundred pixels tall; the cap is 90 points and this is the
			   tallest row anywhere in the workbook. */
			evaluate: `() => {
				const row = [...document.querySelectorAll('[data-testid="capture-row"]')]
					.find((r) => r.dataset.name.endsWith('.xlsx'));
				const h = Number(row?.dataset.maxheight);
				return [h, h <= 90];
			}`,
			expected: [90, true],
			label: 'the tallest row in the workbook is at the cap, not past it'
		}
	]
};
