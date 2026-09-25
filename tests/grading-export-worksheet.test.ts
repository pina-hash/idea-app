import { describe, expect, it } from 'vitest';
import {
	WORKSHEET_ANSWERS_SHEET,
	WORKSHEET_REMOVED_TYPE,
	WORKSHEET_WITHHELD_CELL,
	buildGradingExport,
	gradingExportJson,
	gradingExportSheets,
	worksheetTableRows,
	type ExportIdentity,
	type GradingExportInput
} from '../src/lib/classroom/grading-export';
import type {
	ResponseRow,
	RubricCriterion,
	StudentWork,
	SubmissionFileRow,
	SubmissionRow
} from '../src/lib/classroom/assignment-spec';
import type { ClassroomItem, ClassroomSection } from '../src/lib/classroom/classroom';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';
import { hxCompletion } from '../src/lib/classroom/html-assignment/progress';
import { buildXlsx } from '../src/lib/xlsx';
import { readXlsxParts, readXlsxWorkbook } from '../src/lib/xlsx-read';

/**
 * THE GRADED-WORK EXPORT OF A PORTED HTML WORKSHEET (ledger 0298, R24).
 *
 * Before this, a schema-3 export carried every student with ZERO answers,
 * because the export walked only `spec.modules` and a worksheet has no spec.
 * That half fails visibly and is measured in `/dev/html-assignment-grading
 * ?state=export`. Three halves fail SILENTLY, which is this repo's bar for an
 * automated test:
 *
 *  1. AN ANSWER UNDER THE WRONG STUDENT OR THE WRONG QUESTION. A workbook with
 *     Bruno's material in Alice's row opens, reads plausibly and is wrong. So
 *     every cell of the Answers sheet is asserted against values typed from the
 *     fixture below, never read off the exporter.
 *  2. A NAME IN AN ANONYMOUS FILE. A worksheet's HEADER is the student's own
 *     name field, so "names are NOT in this file" is a promise the header
 *     answers can break with nothing on screen to say so. Asserted over the
 *     serialized bytes of both formats, with the named export as the positive
 *     control on the same fixture.
 *  3. COMPLETENESS DISAGREEING WITH THE CONSOLE. The expected value comes from
 *     `hxCompletion` called directly -- the one predicate the roster chip reads
 *     -- never from the exporter.
 */

const ITEM_ID = 'i-ws';
const TEACHER = 'teacher@boscotech.edu';

const MANIFEST: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Blade Build',
	course: 'IDEA100',
	points: 10,
	header: [{ id: 'hd-name', field: 'studentName', type: 'text' }],
	modules: [
		{
			id: 'm-build',
			title: 'Build',
			points: 6,
			blocks: [
				{ id: 'b-why', field: 'why', type: 'longText', minSentences: 2 },
				{ id: 'b-mat', field: 'material', type: 'radio' },
				{ id: 'b-safe', field: 'safetyChecked', type: 'checkbox' }
			],
			criteria: [
				{
					id: 'build',
					text: 'Build answered',
					points: 6,
					levels: [
						{ points: 6, label: 'Complete', short: 'All answered', descriptor: 'All answered.' },
						{ points: 3, label: 'Partial', short: 'Some answered', descriptor: 'Some answered.' },
						{ points: 0, label: 'Absent', short: 'Nothing', descriptor: 'Nothing.' }
					]
				}
			]
		},
		{
			id: 'm-evid',
			title: 'Evidence',
			points: 4,
			blocks: [
				{ id: 'e-meas', field: 'measurements', type: 'table' },
				{ id: 'e-grid', field: 'grid', type: 'table' },
				{ id: 'e-photo', field: 'photo', type: 'image' }
			],
			criteria: [
				{
					id: 'evid',
					text: 'Evidence present',
					points: 4,
					levels: [
						{ points: 4, label: 'Complete', short: 'All present', descriptor: 'All present.' },
						{ points: 2, label: 'Partial', short: 'Some present', descriptor: 'Some present.' },
						{ points: 0, label: 'Absent', short: 'Nothing', descriptor: 'Nothing.' }
					]
				}
			]
		}
	]
};

const RUBRIC: RubricCriterion[] = [
	{
		id: 'm-build-build',
		criterion: 'Build answered',
		levels: [
			{ points: 6, label: 'Complete', short: 'All answered', descriptor: 'All answered.' },
			{ points: 3, label: 'Partial', short: 'Some answered', descriptor: 'Some answered.' },
			{ points: 0, label: 'Absent', short: 'Nothing', descriptor: 'Nothing.' }
		]
	},
	{
		id: 'm-evid-evid',
		criterion: 'Evidence present',
		levels: [
			{ points: 4, label: 'Complete', short: 'All present', descriptor: 'All present.' },
			{ points: 2, label: 'Partial', short: 'Some present', descriptor: 'Some present.' },
			{ points: 0, label: 'Absent', short: 'Nothing', descriptor: 'Nothing.' }
		]
	}
] as RubricCriterion[];

const SECTION: ClassroomSection = {
	id: 's-ws',
	course_id: 'c-1',
	label: 'Period 2',
	block: '2',
	teacher_email: TEACHER,
	active: true,
	course: { id: 'c-1', code: 'IDEA100', title: 'Engineering Essentials', active: true }
};

const DUE = '2026-09-20T07:00:00.000Z';

const ITEM: ClassroomItem = {
	id: ITEM_ID,
	kind: 'assignment',
	title: 'Blade Build',
	body: '',
	body_doc: null,
	points: 10,
	due_at: DUE,
	category: null,
	author_email: TEACHER,
	author_name: 'A. Pina',
	published: true,
	pinned: false,
	sort_order: 0,
	first_published_at: '2026-09-10T07:00:00.000Z',
	edited_at: null,
	created_at: '2026-09-10T07:00:00.000Z',
	updated_at: '2026-09-10T07:00:00.000Z',
	links: [],
	attachments: [],
	postings: []
};

/** Distinctive strings a leak would show up as. Nothing else in the fixture contains them. */
const ALICE_NAME = 'Zephyrine Quillfeather';
const ALICE_EMAIL = 'zephyrine.q@boscotech.net';
const BRUNO_NAME = 'Bartholomew Vantongeren';
const BRUNO_EMAIL = 'bart.v@boscotech.net';
const CARA_EMAIL = 'cara.c@boscotech.net';

const r = (email: string, block: string, value: ResponseRow['value'], at: string): ResponseRow => ({
	item_id: ITEM_ID,
	student_email: email,
	block_id: block,
	value,
	updated_at: at
});

function submission(over: Partial<SubmissionRow> & Pick<SubmissionRow, 'id' | 'student_email' | 'state'>): SubmissionRow {
	return {
		item_id: ITEM_ID,
		submitted_at: null,
		returned_at: null,
		rubric_scores: null,
		criterion_comments: null,
		score: null,
		teacher_comment: null,
		graded_by: null,
		graded_at: null,
		...over
	};
}

const GRADED = '2026-09-21T18:00:00.000Z';

/**
 * ALICE: every counted block answered, RETURNED at `GRADED`, and then her
 * reasoning edited and a second photo added after it -- which is also after
 * the due instant, so her work is complete and LATE. She also carries an
 * answer to a block the manifest no longer declares, and her own name in the
 * header.
 */
const ALICE: StudentWork = {
	email: ALICE_EMAIL,
	displayName: ALICE_NAME,
	active: true,
	submission: submission({
		id: 'sub-a',
		student_email: ALICE_EMAIL,
		state: 'returned',
		returned_at: GRADED,
		rubric_scores: { 'm-build-build': 6, 'm-evid-evid': 2 },
		score: 8,
		graded_by: TEACHER,
		graded_at: GRADED
	}),
	responses: [
		r(ALICE_EMAIL, 'hd-name', { text: ALICE_NAME }, '2026-09-15T18:00:00.000Z'),
		r(ALICE_EMAIL, 'b-why', { text: 'The blade flexed at the root. A fillet fixed it.' }, '2026-09-22T18:00:00.000Z'),
		r(ALICE_EMAIL, 'b-mat', { text: 'aluminum' }, '2026-09-15T18:00:00.000Z'),
		r(ALICE_EMAIL, 'b-safe', { checked: [true] }, '2026-09-15T18:00:00.000Z'),
		r(
			ALICE_EMAIL,
			'e-meas',
			{
				text: JSON.stringify([
					{ limit: 'Diameter (in)', measured: '2.5' },
					{ limit: 'Mass (g)', measured: '' },
					{ limit: '', measured: '' }
				])
			},
			'2026-09-15T18:00:00.000Z'
		),
		r(ALICE_EMAIL, 'e-grid', { text: JSON.stringify([['pass', 'mm'], ['1', 0.4]]) }, '2026-09-15T18:00:00.000Z'),
		r(ALICE_EMAIL, 'old-q', { text: 'From the first upload' }, '2026-09-12T18:00:00.000Z')
	],
	files: [
		{
			id: 'fa-1',
			submission_id: 'sub-a',
			block_id: 'e-photo',
			filename: 'blade-root.png',
			caption: 'Root, before',
			mime_type: 'application/octet-stream',
			sort_order: 1,
			created_at: '2026-09-15T18:00:00.000Z'
		},
		{
			id: 'fa-2',
			submission_id: 'sub-a',
			block_id: 'e-photo',
			filename: 'blade-root-fillet.png',
			caption: null,
			mime_type: 'application/octet-stream',
			sort_order: 2,
			created_at: '2026-09-23T18:00:00.000Z'
		}
	] as SubmissionFileRow[],
	approvals: []
};

/**
 * BRUNO: partly done, no submission row (typing never creates one), one
 * sentence of two, the safety box explicitly UNticked (an answer), and a table
 * row carrying a column Alice's rows do not.
 */
const BRUNO: StudentWork = {
	email: BRUNO_EMAIL,
	displayName: BRUNO_NAME,
	active: true,
	submission: null,
	responses: [
		r(BRUNO_EMAIL, 'hd-name', { text: BRUNO_NAME }, '2026-09-16T18:00:00.000Z'),
		r(BRUNO_EMAIL, 'b-why', { text: 'It bent.' }, '2026-09-16T18:00:00.000Z'),
		r(BRUNO_EMAIL, 'b-safe', { checked: [false] }, '2026-09-16T18:00:00.000Z'),
		r(
			BRUNO_EMAIL,
			'e-meas',
			{ text: JSON.stringify([{ limit: 'Diameter (in)', measured: '3', note: 'rough' }]) },
			'2026-09-16T18:00:00.000Z'
		)
	],
	files: [],
	approvals: []
};

/** CARA: nothing at all. Present, and recognisably empty. */
const CARA: StudentWork = {
	email: CARA_EMAIL,
	displayName: 'Cara Chen',
	active: true,
	submission: null,
	responses: [],
	files: [],
	approvals: []
};

const NOW = new Date('2026-09-25T15:00:00.000Z');

function input(over: Partial<GradingExportInput> = {}): GradingExportInput {
	return {
		section: SECTION,
		item: ITEM,
		spec: null,
		manifest: MANIFEST,
		rubric: RUBRIC,
		roster: [ALICE, BRUNO, CARA],
		selectedEmail: ALICE_EMAIL,
		scope: 'section',
		identity: 'included',
		now: NOW,
		...over
	};
}

async function workbook(identity: ExportIdentity = 'included') {
	return readXlsxWorkbook(await buildXlsx(gradingExportSheets(buildGradingExport(input({ identity })))));
}

describe('the JSON walks the manifest', () => {
	it('carries the manifest verbatim where the spec goes, and the spec stays null', () => {
		const a = buildGradingExport(input()).assignments[0];
		expect(a.spec).toBeNull();
		expect(a.manifest).toEqual(MANIFEST);
		// Where the spec goes: the key follows `spec` in the file.
		const text = gradingExportJson(buildGradingExport(input()));
		expect(text.indexOf('"manifest"')).toBeGreaterThan(text.indexOf('"spec": null'));
		expect(text.indexOf('"manifest"')).toBeLessThan(text.indexOf('"rubric"'));
	});

	it('lists every manifest block for every student, in document order, then a removed block', () => {
		const students = buildGradingExport(input()).assignments[0].students;
		const ids = ['hd-name', 'b-why', 'b-mat', 'b-safe', 'e-meas', 'e-grid', 'e-photo'];
		expect(students[0].responses.map((e) => e.blockId)).toEqual([...ids, 'old-q']);
		expect(students[1].responses.map((e) => e.blockId)).toEqual(ids);
		// Cara did nothing and still has every block, none started.
		expect(students[2].responses.map((e) => e.blockId)).toEqual(ids);
		expect(students[2].responses.every((e) => !e.started)).toBe(true);
		expect(students[0].responses.at(-1)?.blockType).toBe(WORKSHEET_REMOVED_TYPE);
	});

	it('shapes each value by the manifest type', () => {
		const [alice, bruno] = buildGradingExport(input()).assignments[0].students;
		const v = (s: typeof alice, id: string) => s.responses.find((e) => e.blockId === id)!.value;
		expect(v(alice, 'b-why')).toEqual({
			text: 'The blade flexed at the root. A fillet fixed it.',
			sentences: 2,
			minSentences: 2
		});
		expect(v(alice, 'b-mat')).toEqual({ choice: 'aluminum' });
		expect(v(bruno, 'b-mat')).toEqual({ choice: null });
		expect(v(alice, 'b-safe')).toEqual({ checked: true });
		expect(v(bruno, 'b-safe')).toEqual({ checked: false });
		expect(v(alice, 'e-photo')).toEqual({
			files: [
				{ filename: 'blade-root.png', caption: 'Root, before' },
				{ filename: 'blade-root-fillet.png', caption: null }
			],
			count: 2
		});
		expect(v(alice, 'e-grid')).toEqual({
			columns: [
				{ key: '#1', label: 'Column 1' },
				{ key: '#2', label: 'Column 2' }
			],
			rows: [
				{ '#1': 'pass', '#2': 'mm' },
				{ '#1': '1', '#2': '0.4' }
			],
			filledRows: 2
		});
	});

	it('labels every answer "<module title>: <field>", the header as Identity', () => {
		const alice = buildGradingExport(input()).assignments[0].students[0];
		expect(alice.responses.map((e) => e.prompt)).toEqual([
			'Identity: studentName',
			'Build: why',
			'Build: material',
			'Build: safetyChecked',
			'Evidence: measurements',
			'Evidence: grid',
			'Evidence: photo',
			'old-q (no longer in the worksheet)'
		]);
	});

	it('completeness is hxCompletion, and late is against the due instant', () => {
		const students = buildGradingExport(input()).assignments[0].students;
		for (const [s, row] of students.map((s, i) => [s, [ALICE, BRUNO, CARA][i]] as const)) {
			const want = hxCompletion(MANIFEST, row.responses, row.files);
			expect(s.completeness.basis).toBe('manifest');
			expect(s.completeness.evaluated).toBe(true);
			expect(s.completeness.complete).toBe(want.complete);
			expect(s.completeness.completedAt).toBe(want.complete ? want.at : null);
		}
		expect(students[0].completeness.complete).toBe(true);
		// Her photo arrived on the 23rd, after the 20th's due instant.
		expect(students[0].completeness.completedAt).toBe('2026-09-23T18:00:00.000Z');
		expect(students[0].completeness.late).toBe(true);
		expect(students[1].completeness.complete).toBe(false);
		expect(students[1].completeness.late).toBe(false);
	});

	it('lists what is still unanswered, for every student, in the rail’s words', () => {
		const [alice, bruno, cara] = buildGradingExport(input()).assignments[0].students;
		expect(alice.completeness.unmet).toEqual([]);
		expect(bruno.completeness.unmet.map((u) => u.requirement)).toEqual([
			'Build: "why" needs 1 more sentence (1 of 2).',
			'Build: "material" has an empty answer.',
			'Evidence: "grid" has an empty table.',
			'Evidence: "photo" is waiting for a photo.'
		]);
		expect(bruno.completeness.unmetCount).toBe(4);
		// Six counted blocks; the header is identity and is not counted.
		expect(cara.completeness.unmetCount).toBe(6);
	});

	it('the state word says Complete for a finished worksheet with no row', () => {
		const late = buildGradingExport(
			input({ roster: [{ ...ALICE, submission: null }], item: ITEM })
		).assignments[0].students[0];
		expect(late.submission.stateLabel).toBe('Complete, late');
		const onTime = buildGradingExport(
			input({ roster: [{ ...ALICE, submission: null }], item: { ...ITEM, due_at: null } })
		).assignments[0].students[0];
		expect(onTime.submission.stateLabel).toBe('Complete');
		const [alice, bruno, cara] = buildGradingExport(input()).assignments[0].students;
		expect([alice.submission.stateLabel, bruno.submission.stateLabel, cara.submission.stateLabel]).toEqual([
			'Returned',
			'In progress',
			'Not submitted'
		]);
	});

	it('carries the whole-row change and the per-answer change after grading', () => {
		const alice = buildGradingExport(input()).assignments[0].students[0];
		expect(alice.submission.changedAfterGrading).toEqual({
			kinds: ['edited'],
			at: '2026-09-22T18:00:00.000Z',
			gradedAt: GRADED
		});
		const changed = alice.responses
			.filter((e) => e.changedAfterGrading)
			.map((e) => [e.blockId, e.changedAfterGrading!.kind, e.changedAfterGrading!.at]);
		expect(changed).toEqual([
			['b-why', 'edited', '2026-09-22T18:00:00.000Z'],
			['e-photo', 'file', '2026-09-23T18:00:00.000Z']
		]);
	});
});

describe('the workbook, every cell read back out of the bytes', () => {
	it('adds the Answers sheet, and names the table sheets after their module and field', async () => {
		const wb = await workbook();
		expect([...wb.keys()]).toEqual([
			'Grades',
			WORKSHEET_ANSWERS_SHEET,
			'Unmet checks',
			'Responses',
			'Evidence measurements',
			'Evidence grid',
			'Files',
			'About this export'
		]);
	});

	it('Answers: one row per student, one column per question, every cell', async () => {
		const sheet = (await workbook()).get(WORKSHEET_ANSWERS_SHEET)!;
		expect(sheet.header).toEqual([
			'Student',
			'Name',
			'State',
			'Identity: studentName',
			'Build: why',
			'Build: material',
			'Build: safetyChecked',
			'Evidence: measurements',
			'Evidence: grid',
			'Evidence: photo',
			'old-q (no longer in the worksheet)'
		]);
		expect(sheet.rows).toEqual([
			[
				'Student 1',
				ALICE_NAME,
				'Returned',
				ALICE_NAME,
				'The blade flexed at the root. A fillet fixed it.',
				'aluminum',
				'Yes',
				'2 rows, in the "Evidence measurements" sheet.',
				'2 rows, in the "Evidence grid" sheet.',
				'blade-root.png (Root, before)\nblade-root-fillet.png',
				'From the first upload'
			],
			[
				'Student 2',
				BRUNO_NAME,
				'In progress',
				BRUNO_NAME,
				'It bent.',
				'',
				'No',
				'1 row, in the "Evidence measurements" sheet.',
				'No rows filled in.',
				'',
				''
			],
			['Student 3', 'Cara Chen', 'Not submitted', '', '', '', '', 'No rows filled in.', 'No rows filled in.', '', '']
		]);
	});

	it('Grades: the Complete column is the worksheet’s own answer, late included', async () => {
		const sheet = (await workbook()).get('Grades')!;
		const col = sheet.header.indexOf('Complete');
		const unmet = sheet.header.indexOf('Unmet checks');
		const state = sheet.header.indexOf('State');
		expect(sheet.rows.map((row) => [row[state], row[col], row[unmet]])).toEqual([
			['Returned', 'Yes, late', '0'],
			['In progress', 'No', '4'],
			['Not submitted', 'No', '6']
		]);
	});

	it('a worksheet table gets real columns named from its row keys, blank rows dropped', async () => {
		const wb = await workbook();
		const meas = wb.get('Evidence measurements')!;
		expect(meas.header).toEqual(['Student', 'Name', 'Row', 'limit', 'measured', 'note']);
		expect(meas.rows).toEqual([
			['Student 1', ALICE_NAME, '1', 'Diameter (in)', '2.5', ''],
			['Student 1', ALICE_NAME, '2', 'Mass (g)', '', ''],
			['Student 2', BRUNO_NAME, '1', 'Diameter (in)', '3', 'rough']
		]);
		const grid = wb.get('Evidence grid')!;
		expect(grid.header).toEqual(['Student', 'Name', 'Row', 'Column 1', 'Column 2']);
		expect(grid.rows).toEqual([
			['Student 1', ALICE_NAME, '1', 'pass', 'mm'],
			['Student 1', ALICE_NAME, '2', '1', '0.4']
		]);
		const about = wb.get('About this export')!;
		expect(about.rows.find((row) => row[0] === 'Blank table rows dropped')?.[1]).toMatch(/^1 /);
	});

	it('Responses: every answer with the change after grading beside it', async () => {
		const sheet = (await workbook()).get('Responses')!;
		expect(sheet.header).toEqual([
			'Student',
			'Name',
			'Module',
			'Block',
			'Type',
			'Prompt',
			'Started',
			'Answer',
			'Changed after grading',
			'Changed at'
		]);
		const alice = sheet.rows.filter((row) => row[0] === 'Student 1');
		expect(alice.map((row) => [row[3], row[4], row[6], row[8], row[9]])).toEqual([
			['hd-name', 'text', 'Yes', '', ''],
			['b-why', 'longText', 'Yes', 'Edited after grading', '2026-09-22T18:00:00.000Z'],
			['b-mat', 'radio', 'Yes', '', ''],
			['b-safe', 'checkbox', 'Yes', '', ''],
			['e-meas', 'table', 'Yes', '', ''],
			['e-grid', 'table', 'Yes', '', ''],
			['e-photo', 'image', 'Yes', 'Photo added after grading', '2026-09-23T18:00:00.000Z'],
			['old-q', WORKSHEET_REMOVED_TYPE, 'Yes', '', '']
		]);
		expect(sheet.rows.filter((row) => row[0] === 'Student 3').every((row) => row[6] === 'No')).toBe(true);
	});

	it('Unmet checks: Bruno’s four, Cara’s six, none for Alice', async () => {
		const sheet = (await workbook()).get('Unmet checks')!;
		const count = (label: string) => sheet.rows.filter((row) => row[0] === label).length;
		expect([count('Student 1'), count('Student 2'), count('Student 3')]).toEqual([0, 4, 6]);
	});
});

describe('a name is in the file only when the switch says so, header answers included', () => {
	it('INCLUDED: both names are in the JSON and in the workbook (the positive control)', async () => {
		const text = gradingExportJson(buildGradingExport(input({ identity: 'included' })));
		expect(text).toContain(ALICE_NAME);
		expect(text).toContain(BRUNO_NAME);
		const parts = [...(await readXlsxParts(await buildXlsx(gradingExportSheets(buildGradingExport(input())))))
			.values()].join('\n');
		expect(parts).toContain(ALICE_NAME);
		expect(parts).toContain(BRUNO_NAME);
	});

	it('OMITTED: neither name, and no address, anywhere in the JSON bytes', () => {
		const text = gradingExportJson(buildGradingExport(input({ identity: 'omitted' })));
		for (const needle of [ALICE_NAME, BRUNO_NAME, 'Zephyrine', 'Vantongeren', ALICE_EMAIL, BRUNO_EMAIL]) {
			expect(text).not.toContain(needle);
		}
		// The header block is still listed, and says whether it was filled in.
		const alice = buildGradingExport(input({ identity: 'omitted' })).assignments[0].students[0];
		const header = alice.responses.find((e) => e.blockId === 'hd-name')!;
		expect(header.value).toEqual({ withheld: true });
		expect(header.started).toBe(true);
		// Every non-identity answer is still there.
		expect(alice.responses.find((e) => e.blockId === 'b-mat')!.value).toEqual({ choice: 'aluminum' });
		// A block that has LEFT the manifest could have been the header's own
		// name field, and nothing says it was not, so it is withheld too. Its
		// text here is not a name, which is exactly why this is asserted on the
		// value rather than by searching the bytes: a byte search would pass.
		expect(alice.responses.find((e) => e.blockId === 'old-q')!.value).toEqual({ withheld: true });
		const named = buildGradingExport(input({ identity: 'included' })).assignments[0].students[0];
		expect(named.responses.find((e) => e.blockId === 'old-q')!.value).toEqual({ text: 'From the first upload' });
	});

	it('OMITTED: neither name, and no address, anywhere in any part of the workbook', async () => {
		const parts = [
			...(await readXlsxParts(await buildXlsx(gradingExportSheets(buildGradingExport(input({ identity: 'omitted' }))))))
				.values()
		].join('\n');
		for (const needle of [ALICE_NAME, BRUNO_NAME, 'Zephyrine', 'Vantongeren', ALICE_EMAIL, BRUNO_EMAIL]) {
			expect(parts).not.toContain(needle);
		}
		const answers = (await workbook('omitted')).get(WORKSHEET_ANSWERS_SHEET)!;
		expect(answers.rows[0][2]).toBe(WORKSHEET_WITHHELD_CELL);
	});
});

describe('the no-spec, no-manifest export is unchanged', () => {
	it('still reads "No spec" and walks nothing', () => {
		const s = buildGradingExport(input({ manifest: null })).assignments[0];
		expect(s.manifest).toBeUndefined();
		expect(s.students[0].responses).toEqual([]);
		expect(s.students[0].completeness.evaluated).toBe(false);
	});
});

describe('worksheetTableRows', () => {
	it('keeps a value that is not a table, as typed', () => {
		expect(worksheetTableRows('not json')).toEqual({ columns: [], rows: [], raw: 'not json' });
		expect(worksheetTableRows('{"a":1}')).toEqual({ columns: [], rows: [], raw: '{"a":1}' });
		expect(worksheetTableRows('')).toEqual({ columns: [], rows: [], raw: null });
		expect(worksheetTableRows('{"rows":[{"x":"1"}]}')).toEqual({
			columns: [{ key: 'x', label: 'x' }],
			rows: [{ x: '1' }],
			raw: null
		});
	});
});

describe('what the review of R24 added (ledger 0298)', () => {
	/*
		A HEADER PHOTO IS IDENTITY TOO. The header is the student's name, team
		and date, and a manifest may put an image there. With names left out,
		its answer cell has to say it was withheld (it used to print a blank,
		which reads as "no photo"), and its filename and caption must not be
		listed in the JSON's files or on the Files sheet. The caption here
		carries Alice's name, so a byte search is a real probe; the named export
		is its positive control.
	*/
	const HEADSHOT = 'zephyrine-headshot.png';
	const WITH_HEADSHOT: HtmlAssignmentManifest = {
		...MANIFEST,
		header: [...(MANIFEST.header ?? []), { id: 'hd-face', field: 'headshot', type: 'image' }]
	};
	const ALICE_FACE: StudentWork = {
		...ALICE,
		files: [
			...ALICE.files,
			{
				id: 'fa-face',
				submission_id: 'sub-a',
				block_id: 'hd-face',
				filename: HEADSHOT,
				caption: 'Zephyrine at the bench',
				mime_type: 'application/octet-stream',
				sort_order: 3,
				created_at: '2026-09-15T18:00:00.000Z'
			} as SubmissionFileRow
		]
	};
	const faceInput = (identity: ExportIdentity) =>
		input({ manifest: WITH_HEADSHOT, roster: [ALICE_FACE, BRUNO, CARA], identity });

	it('INCLUDED: the header photo is listed and named in its cell (the positive control)', async () => {
		const payload = buildGradingExport(faceInput('included'));
		const alice = payload.assignments[0].students[0];
		expect(alice.files.map((f) => f.filename)).toContain(HEADSHOT);
		const wb = await readXlsxWorkbook(await buildXlsx(gradingExportSheets(payload)));
		const answers = wb.get(WORKSHEET_ANSWERS_SHEET)!;
		expect(answers.rows[0][answers.header.indexOf('Identity: headshot')]).toBe(
			`${HEADSHOT} (Zephyrine at the bench)`
		);
		expect(wb.get('Files')!.rows.some((row) => row.includes(HEADSHOT))).toBe(true);
	});

	it('OMITTED: the header photo is withheld in its cell, and listed nowhere', async () => {
		const payload = buildGradingExport(faceInput('omitted'));
		const alice = payload.assignments[0].students[0];
		expect(alice.files.map((f) => f.filename)).toEqual(['blade-root.png', 'blade-root-fillet.png']);
		const face = alice.responses.find((e) => e.blockId === 'hd-face')!;
		expect(face.value).toEqual({ withheld: true });
		expect(face.started).toBe(true);
		const wb = await readXlsxWorkbook(await buildXlsx(gradingExportSheets(payload)));
		const answers = wb.get(WORKSHEET_ANSWERS_SHEET)!;
		expect(answers.rows[0][answers.header.indexOf('Identity: headshot')]).toBe(WORKSHEET_WITHHELD_CELL);
		const text = gradingExportJson(payload);
		const parts = [...(await readXlsxParts(await buildXlsx(gradingExportSheets(payload)))).values()].join('\n');
		for (const needle of [HEADSHOT, 'Zephyrine', ALICE_NAME]) {
			expect(text).not.toContain(needle);
			expect(parts).not.toContain(needle);
		}
	});

	/*
		A DOCUMENT IMPORTED OVER A SPEC ASSIGNMENT leaves the spec's answers
		behind under block ids the manifest does not declare, and a spec
		table's `rows` or a checklist's several ticks are shapes the bridge
		reads as nothing or as one tick. They are exported as stored, never as
		an empty answer.
	*/
	it('a removed block the bridge cannot read whole is exported as stored, and counts as started', async () => {
		const rows = [{ member: 'Rib', force: '40' }];
		const ALICE_OLD: StudentWork = {
			...ALICE,
			responses: [
				...ALICE.responses,
				r(ALICE_EMAIL, 'old-table', { rows }, '2026-09-12T18:00:00.000Z'),
				r(ALICE_EMAIL, 'old-list', { checked: [true, false, true] }, '2026-09-12T18:00:00.000Z'),
				r(ALICE_EMAIL, 'old-empty', { rows: [] }, '2026-09-12T18:00:00.000Z')
			]
		};
		const payload = buildGradingExport(input({ roster: [ALICE_OLD, BRUNO, CARA] }));
		const alice = payload.assignments[0].students[0];
		const at = (id: string) => alice.responses.find((e) => e.blockId === id)!;
		expect(at('old-table').value).toEqual({ stored: { rows } });
		expect(at('old-table').started).toBe(true);
		expect(at('old-list').value).toEqual({ stored: { checked: [true, false, true] } });
		// A lone text and an empty value keep the bridge's own reading.
		expect(at('old-q').value).toEqual({ text: 'From the first upload' });
		expect(at('old-empty').value).toEqual({ text: '' });
		expect(at('old-empty').started).toBe(false);
		const answers = (await readXlsxWorkbook(await buildXlsx(gradingExportSheets(payload)))).get(WORKSHEET_ANSWERS_SHEET)!;
		const cell = (id: string) => answers.rows[0][answers.header.indexOf(`${id} (no longer in the worksheet)`)];
		expect(cell('old-table')).toBe(JSON.stringify({ rows }));
		expect(cell('old-list')).toBe(JSON.stringify({ checked: [true, false, true] }));
		// Withheld with names left out, like every removed block.
		const anon = buildGradingExport(input({ roster: [ALICE_OLD, BRUNO, CARA], identity: 'omitted' }));
		expect(anon.assignments[0].students[0].responses.find((e) => e.blockId === 'old-table')!.value).toEqual({
			withheld: true
		});
	});
});
