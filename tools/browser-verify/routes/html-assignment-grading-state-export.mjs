/**
 * THE GRADED-WORK EXPORT OF A PORTED HTML WORKSHEET (ledger 0298, R24).
 *
 * Before R24 a schema-3 export carried every student with ZERO answers: the
 * export walked only `spec.modules`, and a worksheet has no spec. This state
 * gives the fixture every manifest block type (text, longText, checkbox,
 * image, and a second module holding a radio and two tables -- one stored as
 * a list of objects, one as a list of lists), an answer to a block the
 * manifest no longer declares, and three students: Alice returned and then
 * edited after the grade and after the due instant, Bruno part way, Cara
 * finished on time.
 *
 * EVERY FILE BELOW CAME OUT OF PRESSING THE CONSOLE'S OWN CONTROLS. The
 * harness intercepts the `<a download>` and reads the Blob BACK: the JSON
 * parsed, the workbook inflated through `$lib/xlsx-read`, the CSV as text.
 * Every expected value is typed from the fixture in the harness, never read
 * off the builder, so a pass compares a produced file against the fixture.
 *
 * THE IDENTITY SWITCH IS MEASURED BOTH WAYS on the workbook: the named file
 * carries a roster name (the positive control), the anonymous one carries
 * none, and the header answer (the team name) is withheld there.
 */

const CAPTURE = (name) =>
	`[...document.querySelectorAll('[data-testid="hx-capture"]')].find((c) => c.dataset.name === ${JSON.stringify(name)})`;
const READBACK = (name) => `JSON.parse(${CAPTURE(name)}?.dataset.readback ?? 'null')`;

const JSON_NAMED = 'graded-hx-smoke-test-idea100-block-4-block-4-class.json';
const XLSX_NAMED = 'graded-hx-smoke-test-idea100-block-4-block-4-class.xlsx';
const XLSX_ANON = 'graded-hx-smoke-test-idea100-block-4-block-4-class-anon.xlsx';

export default {
	path: '/dev/html-assignment-grading?state=export',
	label: 'Grading console: a ported worksheet exports its answers, every block type, read back out of the files',
	prepare: [
		{ waitFor: `() => document.querySelectorAll('.roster-row').length === 3`, attempts: 40, gapMs: 250 },
		{
			click: '[data-testid="work-export-disclosure"]',
			until: `() => document.querySelector('[data-testid="work-export-disclosure"]')?.getAttribute('aria-expanded') === 'true'`,
			label: 'the export panel is open, one press from its collapsed default',
			attempts: 12,
			gapMs: 200
		},
		{
			click: '[data-testid="export-json-class"]',
			until: `() => document.querySelectorAll('[data-testid="hx-capture"]').length === 1`
		},
		{
			/* Built through `CompressionStream`, so it lands a little after the JSON. */
			click: '[data-testid="export-workbook"]',
			until: `() => document.querySelectorAll('[data-testid="hx-capture"]').length === 2`
		},
		{
			/* THE GRADEBOOK CSV, which is schema-agnostic and must still carry the
			   returned score. */
			click: '.roster-head button',
			until: `() => document.querySelectorAll('[data-testid="hx-capture"]').length === 3`
		},
		{
			click: '[data-testid="export-identity"] input',
			force: true,
			until: `() => document.querySelector("[data-testid='export-identity-note']")?.textContent.includes('NOT in this file') === true`
		},
		{
			click: '[data-testid="export-workbook"]',
			until: `() => document.querySelectorAll('[data-testid="hx-capture"]').length === 4`
		}
	],
	presence: [
		{ selector: '[data-testid="hx-capture"]', label: 'files the controls produced', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="hx-capture-empty"]', label: 'the nothing-exported line (replaced)', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'each press produced its file, named for what it is',
			evaluate: `() => [...document.querySelectorAll('[data-testid="hx-capture"]')].map((c) => c.dataset.name)`,
			expected: [JSON_NAMED, XLSX_NAMED, 'grades-hx-smoke-test-idea100-block-4-block-4.csv', XLSX_ANON]
		},
		{
			label: 'the JSON carries the manifest where the spec goes, and the spec stays null',
			evaluate: `() => { const j = ${READBACK(JSON_NAMED)}; return [j.schemaVersion, j.spec, ...j.manifestModules]; }`,
			expected: [1, null, 'hxw-work', 'hxw-build']
		},
		{
			label: 'JSON, per student: state, basis, complete, late, unmet',
			evaluate: `() => ${READBACK(JSON_NAMED)}.students.map((s) => [s.label, s.state, s.basis, s.complete, s.late, s.unmet].join(' | '))`,
			expected: [
				'Student 1 | Returned | manifest | true | true | 0',
				'Student 2 | In progress | manifest | false | false | 4',
				'Student 3 | Complete | manifest | true | false | 0'
			]
		},
		{
			label: 'JSON, Alice: every block, its type, its label, and its value as stored',
			evaluate: `() => ${READBACK(JSON_NAMED)}.students[0].responses.map((r) => [r.blockId, r.type, r.prompt, r.started, JSON.stringify(r.value), r.changed].join(' | '))`,
			expected: [
				'hxw-team | text | Identity: teamName | true | {"text":"Team Meridian","sentences":1,"minSentences":null} | ',
				'hxw-reflection | longText | Work: reflection | true | {"text":"I modelled the blade root and the hub today. The fillet at the root took three tries before it would rebuild.","sentences":2,"minSentences":2} | edited',
				'hxw-done | checkbox | Work: checkedOff | true | {"checked":true} | ',
				'hxw-photo | image | Work: photo | true | {"files":[{"filename":"blade-root-fillet.png","caption":"The fillet after the third rebuild"}],"count":1} | file',
				'hxw-material | radio | Build: material | true | {"choice":"aluminum"} | ',
				'hxw-measure | table | Build: measurements | true | {"columns":[{"key":"limit","label":"limit"},{"key":"measured","label":"measured"}],"rows":[{"limit":"Diameter (in)","measured":"2.5"},{"limit":"Mass (g)","measured":""},{"limit":"","measured":""}],"filledRows":2} | ',
				'hxw-grid | table | Build: grid | true | {"columns":[{"key":"#1","label":"Column 1"},{"key":"#2","label":"Column 2"}],"rows":[{"#1":"pass","#2":"mm"},{"#1":"1","#2":"0.4"}],"filledRows":2} | ',
				'hxw-old | not-in-worksheet | hxw-old (no longer in the worksheet) | true | {"text":"From the first upload"} | '
			]
		},
		{
			label: 'the workbook has the Answers sheet and a sheet per worksheet table, read out of its bytes',
			evaluate: `() => Object.keys(${READBACK(XLSX_NAMED)})`,
			expected: [
				'Grades',
				'Answers',
				'Unmet checks',
				'Responses',
				'Build measurements',
				'Build grid',
				'Files',
				'About this export'
			]
		},
		{
			label: 'Answers: the header is "<module title>: <field>", one column per question',
			evaluate: `() => ${READBACK(XLSX_NAMED)}.Answers.header`,
			expected: [
				'Student',
				'Name',
				'State',
				'Identity: teamName',
				'Work: reflection',
				'Work: checkedOff',
				'Work: photo',
				'Build: material',
				'Build: measurements',
				'Build: grid',
				'hxw-old (no longer in the worksheet)'
			]
		},
		{
			label: 'Answers: every cell, one row per student',
			evaluate: `() => ${READBACK(XLSX_NAMED)}.Answers.rows.map((r) => r.join(' | '))`,
			expected: [
				'Student 1 | Alice Alvarez | Returned | Team Meridian | I modelled the blade root and the hub today. The fillet at the root took three tries before it would rebuild. | Yes | blade-root-fillet.png (The fillet after the third rebuild) | aluminum | 2 rows, in the "Build measurements" sheet. | 2 rows, in the "Build grid" sheet. | From the first upload',
				'Student 2 | Bruno Baptiste | In progress |  | It bent. | No |  |  | 1 row, in the "Build measurements" sheet. | No rows filled in. | ',
				'Student 3 | Cara Chen | Complete | Team Vega | The hub cracked first. I thickened the web. | Yes | hub-web.png | steel | 1 row, in the "Build measurements" sheet. | 1 row, in the "Build grid" sheet. | '
			]
		},
		{
			label: 'Grades: state, the worksheet Complete column, unmet, score and out of',
			evaluate: `() => { const g = ${READBACK(XLSX_NAMED)}.Grades; const at = (n) => g.header.indexOf(n); return g.rows.map((r) => [r[at('State')], r[at('Complete')], r[at('Unmet checks')], r[at('Score')], r[at('Out of')]].join(' | ')); }`,
			expected: ['Returned | Yes, late | 0 | 5 | 10', 'In progress | No | 4 |  | 10', 'Complete | Yes | 0 |  | 10']
		},
		{
			label: 'Unmet checks: Bruno’s four, in the words the progress rail uses',
			evaluate: `() => ${READBACK(XLSX_NAMED)}['Unmet checks'].rows.map((r) => [r[0], r[r.length - 1]].join(' | '))`,
			expected: [
				'Student 2 | Work: "reflection" needs 1 more sentence (1 of 2).',
				'Student 2 | Work: "photo" is waiting for a photo.',
				'Student 2 | Build: "material" has an empty answer.',
				'Student 2 | Build: "grid" has an empty table.'
			]
		},
		{
			label: 'a list-of-objects table: its keys as columns, a third student’s extra key kept, the blank row dropped',
			evaluate: `() => { const t = ${READBACK(XLSX_NAMED)}['Build measurements']; return [t.header.join(' | '), ...t.rows.map((r) => r.join(' | '))]; }`,
			expected: [
				'Student | Name | Row | limit | measured | note',
				'Student 1 | Alice Alvarez | 1 | Diameter (in) | 2.5 | ',
				'Student 1 | Alice Alvarez | 2 | Mass (g) |  | ',
				'Student 2 | Bruno Baptiste | 1 | Diameter (in) | 3 | rough',
				'Student 3 | Cara Chen | 1 | Diameter (in) | 2.4 | '
			]
		},
		{
			label: 'a list-of-lists table: numbered columns',
			evaluate: `() => { const t = ${READBACK(XLSX_NAMED)}['Build grid']; return [t.header.join(' | '), ...t.rows.map((r) => r.join(' | '))]; }`,
			expected: [
				'Student | Name | Row | Column 1 | Column 2',
				'Student 1 | Alice Alvarez | 1 | pass | mm',
				'Student 1 | Alice Alvarez | 2 | 1 | 0.4',
				'Student 3 | Cara Chen | 1 | fail | mm'
			]
		},
		{
			label: 'Responses: Alice’s answers with what moved after the grade, and when',
			evaluate: `() => { const s = ${READBACK(XLSX_NAMED)}.Responses; return s.rows.filter((r) => r[0] === 'Student 1').map((r) => [r[3], r[4], r[6], r[8], r[9]].join(' | ')); }`,
			expected: [
				'hxw-team | text | Yes |  | ',
				'hxw-reflection | longText | Yes | Edited after grading | 2026-09-09T12:12:00.000Z',
				'hxw-done | checkbox | Yes |  | ',
				'hxw-photo | image | Yes | Photo added after grading | 2026-09-09T17:00:00.000Z',
				'hxw-material | radio | Yes |  | ',
				'hxw-measure | table | Yes |  | ',
				'hxw-grid | table | Yes |  | ',
				'hxw-old | not-in-worksheet | Yes |  | '
			]
		},
		{
			label: 'the gradebook CSV still carries the returned score',
			evaluate: `() => ${READBACK('grades-hx-smoke-test-idea100-block-4-block-4.csv')}.replace(/^\\uFEFF/, '').trim().split('\\r\\n')`,
			expected: ['Last,First,Score,Out of', 'Alvarez,Alice,5,10', 'Baptiste,Bruno,,10', 'Chen,Cara,,10']
		},
		{
			label: 'a roster name is in the named workbook and in no cell of the anonymous one',
			evaluate: `() => [${CAPTURE(XLSX_NAMED)}?.dataset.readback.includes('Alvarez'), ${CAPTURE(XLSX_ANON)}?.dataset.readback.includes('Alvarez'), ${CAPTURE(XLSX_ANON)}?.dataset.readback.includes('Team Meridian')]`,
			expected: [true, false, false]
		},
		{
			label: 'the anonymous workbook withholds the header answer, and keeps the rest',
			evaluate: `() => ${READBACK(XLSX_ANON)}.Answers.rows[0].slice(0, 5)`,
			expected: [
				'Student 1',
				'Returned',
				'Withheld: names are left out of this file',
				'I modelled the blade root and the hub today. The fillet at the root took three tries before it would rebuild.',
				'Yes'
			]
		}
	]
};
