import { describe, expect, it } from 'vitest';
import {
	IDENTITY_NOTE,
	MAX_TABLE_SHEETS,
	buildGradingExport,
	gradingExportFilename,
	gradingExportJson,
	gradingExportSheets,
	studentLabels,
	type ExportIdentity,
	type GradingExportInput
} from '../src/lib/classroom/grading-export';
import {
	filesByBlockCount,
	responsesMap,
	rubricFromSpec,
	specUnmet,
	tableRowFilled,
	type AssignmentSpec,
	type ModuleApprovalRow,
	type ResponseRow,
	type StudentWork,
	type SubmissionFileRow,
	type SubmissionRow
} from '../src/lib/classroom/assignment-spec';
import type { ClassroomItem, ClassroomSection } from '../src/lib/classroom/classroom';
import { buildXlsx, sheetName } from '../src/lib/xlsx';
import { readXlsxParts, readXlsxWorkbook } from '../src/lib/xlsx-read';

/**
 * THE GRADED-WORK EXPORT, AND WHY IT HAS A TEST AT ALL.
 *
 * Most of what this module does fails visibly the first time somebody looks: a
 * missing score, a wrong title, a workbook that will not open. That belongs in
 * the dev harness (`/dev/grading-incomplete`) and it is verified there.
 *
 * TWO OF ITS GUARANTEES FAIL SILENTLY, WHICH IS THE BAR THIS REPO SETS FOR AN
 * AUTOMATED TEST:
 *
 *  1. IDENTITY OMISSION. A regression that let a name through produces a file
 *     that looks completely correct -- richer, even -- and the failure is only
 *     discovered after it has been pasted into somebody else's tool. So the
 *     omitted case is asserted over the SERIALIZED BYTES of both formats rather
 *     than over the object graph, and the included case is its positive
 *     control: the same assertion inverted, on the same fixture, so "no name
 *     found" cannot pass because the search was looking in the wrong place.
 *
 *  2. A STUDENT WHO HANDED IN NOTHING BEING DROPPED. An export listing four of
 *     five students is indistinguishable from a class of four. Absence is
 *     information, so the empty record is asserted to be PRESENT and to be
 *     recognisably empty.
 *
 * The unmet list gets a check for a different reason: it must agree with
 * `specUnmet`, the pure mirror of `_classroom_spec_unmet` the console's own
 * chip reads, and a second walk of the spec inside the exporter is exactly the
 * copy that would quietly stop agreeing with what is on screen. The expected
 * value therefore comes from `specUnmet` directly and never from the exporter.
 */

const ITEM_ID = 'i-1';
const SECTION_ID = 's-1';
const TEACHER = 'teacher@boscotech.edu';

const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'idea100-01', title: 'Bridge Sketch', totalPoints: 14 },
	modules: [
		{
			id: 'm1',
			title: 'Three Views',
			points: 8,
			blocks: [
				{ type: 'instructions', content: 'Sketch it.' },
				{ type: 'textField', id: 'f1', prompt: 'Which view was hardest?', minSentences: 3 },
				{
					type: 'table',
					id: 't1',
					columns: [
						{ key: 'member', label: 'Member' },
						{ key: 'loading', label: 'Loading' }
					],
					minRows: 2
				}
			],
			rubric: [
				{
					id: 'views',
					criterion: 'Views complete',
					levels: [
						{ points: 8, label: 'Complete', short: 'All three', descriptor: 'All three views.' },
						{ points: 4, label: 'Partial', descriptor: 'Two views.' },
						{ points: 0, label: 'Absent', descriptor: 'Nothing.' }
					]
				}
			]
		},
		{
			id: 'm2',
			title: 'Photo Evidence',
			points: 6,
			blocks: [
				{ type: 'imageZone', id: 'z1', minImages: 2, captions: true },
				{ type: 'checklist', id: 'c1', items: ['Dated', 'Named'] },
				/*
					THE SECOND TABLE, WITH DIFFERENT COLUMNS, and deliberately with
					NO `minRows`: an unconstrained table exports exactly like a
					constrained one, and leaving it unconstrained keeps the unmet
					expectations elsewhere in this file measuring what they were
					written to measure.
				*/
				{
					type: 'table',
					id: 't2',
					columns: [
						{ key: 'component', label: 'Component' },
						{ key: 'selected', label: 'What you selected' },
						{ key: 'why', label: 'Why it clears' }
					]
				}
			],
			rubric: [
				{
					id: 'photos',
					criterion: 'Photos legible',
					levels: [
						{ points: 6, label: 'Complete', descriptor: 'Both sharp.' },
						{ points: 3, label: 'Partial', descriptor: 'One usable.' },
						{ points: 0, label: 'Absent', descriptor: 'None.' }
					]
				}
			]
		}
	],
	declarations: { academicIntegrity: true }
};

const RUBRIC = rubricFromSpec(SPEC);

const SECTION: ClassroomSection = {
	id: SECTION_ID,
	course_id: 'c-1',
	label: 'Period 1',
	block: '1',
	teacher_email: TEACHER,
	active: true,
	course: { id: 'c-1', code: 'IDEA100', title: 'Engineering I Honors', active: true }
};

const ITEM: ClassroomItem = {
	id: ITEM_ID,
	kind: 'assignment',
	title: 'Bridge Sketch',
	body: 'Sketch the bridge.',
	body_doc: null,
	points: 14,
	due_at: '2026-08-20T07:00:00.000Z',
	category: 'Unit Labs',
	author_email: TEACHER,
	author_name: 'T. Vargas',
	published: true,
	pinned: false,
	sort_order: 0,
	first_published_at: '2026-08-10T07:00:00.000Z',
	edited_at: null,
	created_at: '2026-08-10T07:00:00.000Z',
	updated_at: '2026-08-10T07:00:00.000Z',
	links: [],
	attachments: [],
	postings: []
};

/** The distinctive strings a leak would show up as. Nothing else in the
 *  fixture may contain them, or the omission assertions pass vacuously. */
const ALICE_NAME = 'Alvarez';
const ALICE_EMAIL = 'alice.alvarez@boscotech.net';
const DARA_NAME = 'Nwosu';
const DARA_EMAIL = 'dara.nwosu@boscotech.net';

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

const ALICE_SUB = submission({
	id: 'sub-a',
	student_email: ALICE_EMAIL,
	state: 'returned',
	submitted_at: '2026-08-19T18:00:00.000Z',
	returned_at: '2026-08-21T18:00:00.000Z',
	// 5 on `views` matches NO level (8 / 4 / 0), so it is an override and must
	// carry its comment.
	rubric_scores: { 'm1-views': 5, 'm2-photos': 6 },
	criterion_comments: { 'm1-views': 'Third view was traced, not drawn.' },
	score: 11,
	teacher_comment: 'Redraw the top view before the unit test.',
	graded_by: TEACHER,
	graded_at: '2026-08-21T18:00:00.000Z'
});

/**
 * A PARAGRAPH IN ONE CELL, which is the case the old flattened rendering made
 * unreadable and the case the row-height cap exists for. It also carries the
 * LaTeX a real student typed: the export carries what was written, verbatim,
 * and must never rewrite it.
 */
const PARAGRAPH =
	'It clears the minimum by about 34,468 PSI, which is the margin I was after. ' +
	'I checked the published figure against the McMaster listing and against the ' +
	'6061-T6 datasheet, and both agree. The governing case is $\\sigma = F/A$ at the ' +
	'shoulder, so the stock thickness is what matters here rather than the length.';

const RESPONSES: ResponseRow[] = [
	{
		item_id: ITEM_ID,
		student_email: ALICE_EMAIL,
		block_id: 'f1',
		value: { text: 'The top view was hardest. The chords drifted. I redrew it twice.' }
	},
	{
		item_id: ITEM_ID,
		student_email: ALICE_EMAIL,
		block_id: 't1',
		// One real row and one the student left. `tableRowFilled` is what tells
		// them apart, and it is the SAME predicate `blockProgress` counts with,
		// so the unmet figure and the exported row count cannot disagree.
		value: { rows: [{ member: 'Lower chord', loading: 'Tension' }, { member: '', loading: '  ' }] }
	},
	{
		item_id: ITEM_ID,
		student_email: ALICE_EMAIL,
		block_id: 't2',
		value: {
			rows: [
				{ component: 'Arm Stock', selected: '6061 aluminum 1/2 McMaster-Carr', why: PARAGRAPH },
				// A row with SOME cells filled is real work and stays whole.
				{ component: 'Speed Reduction', selected: 'WCP 1 Motor Gear Box', why: '' },
				// All blank: dropped.
				{ component: '', selected: '', why: '' }
			]
		}
	},
	{ item_id: ITEM_ID, student_email: ALICE_EMAIL, block_id: 'c1', value: { checked: [true, false] } },
	{ item_id: ITEM_ID, student_email: ALICE_EMAIL, block_id: '@declaration', value: { checked: [true] } }
];

const FILES: SubmissionFileRow[] = [
	{
		id: 'img-1',
		submission_id: 'sub-a',
		block_id: 'z1',
		caption: 'Sheet 1',
		filename: 'bridge-front.png',
		mime_type: 'application/octet-stream',
		storage_key: 'sub-a/img-1.png'
	}
];

const APPROVALS: ModuleApprovalRow[] = [];

/** Alice handed in and is short on three checks; Dara did nothing at all. */
const ROSTER: StudentWork[] = [
	{
		email: ALICE_EMAIL,
		displayName: `Alice ${ALICE_NAME}`,
		active: true,
		submission: ALICE_SUB,
		responses: RESPONSES,
		files: FILES,
		approvals: APPROVALS
	},
	{
		email: DARA_EMAIL,
		displayName: `Dara ${DARA_NAME}`,
		active: true,
		submission: null,
		responses: [],
		files: [],
		approvals: []
	}
];

const NOW = new Date('2026-08-31T15:04:05.000Z');

function input(over: Partial<GradingExportInput> = {}): GradingExportInput {
	return {
		section: SECTION,
		item: ITEM,
		spec: SPEC,
		rubric: RUBRIC,
		roster: ROSTER,
		selectedEmail: ALICE_EMAIL,
		scope: 'section',
		identity: 'included',
		now: NOW,
		...over
	};
}

const alice = (identity: ExportIdentity = 'included') =>
	buildGradingExport(input({ identity })).assignments[0].students[0];

describe('top level says what the file is', () => {
	it('carries the scope, the section, the assignment and the timestamp', () => {
		const out = buildGradingExport(input());
		expect(out.export.scope).toBe('section');
		expect(out.export.generatedAt).toBe('2026-08-31T15:04:05.000Z');
		expect(out.export.counts).toEqual({ assignments: 1, students: 2 });
		expect(out.section.title).toBe('IDEA100 · Period 1 · Block 1');
		expect(out.assignments).toHaveLength(1);
		expect(out.assignments[0].itemId).toBe(ITEM_ID);
		expect(out.assignments[0].title).toBe('Bridge Sketch');
		expect(out.assignments[0].dueAt).toBe('2026-08-20T07:00:00.000Z');
		expect(out.assignments[0].outOf).toBe(14);
	});

	it('carries the spec and the rubric AS STORED, not a summary', () => {
		const out = buildGradingExport(input());
		expect(out.assignments[0].spec).toEqual(SPEC);
		expect(out.assignments[0].rubric).toEqual(RUBRIC);
		// The levels are what a model needs to read a score, so they must survive.
		expect(out.assignments[0].rubric?.[0].levels).toHaveLength(3);
	});

	it('is pretty-printed with real newlines', () => {
		const text = gradingExportJson(buildGradingExport(input()));
		expect(text.split('\n').length).toBeGreaterThan(50);
		expect(text).toContain('\n\t"export": {');
		expect(JSON.parse(text).export.schemaVersion).toBe(1);
	});
});

describe('scope', () => {
	it('student scope carries exactly the selected student', () => {
		const out = buildGradingExport(input({ scope: 'student' }));
		expect(out.export.counts.students).toBe(1);
		expect(out.assignments[0].students.map((s) => s.email)).toEqual([ALICE_EMAIL]);
	});

	it('section scope carries every roster row, in roster order', () => {
		const out = buildGradingExport(input({ scope: 'section' }));
		expect(out.assignments[0].students.map((s) => s.email)).toEqual([ALICE_EMAIL, DARA_EMAIL]);
	});

	/**
	 * ABSENCE IS INFORMATION. A student who handed in nothing is the one most
	 * likely to be dropped by a filter written for "work to read", and an
	 * export listing one of two students reads as a class of one.
	 */
	it('keeps a student who submitted nothing, as a recognisably empty record', () => {
		const dara = buildGradingExport(input()).assignments[0].students[1];
		expect(dara.label).toBe('Student 2');
		expect(dara.submission.state).toBeNull();
		expect(dara.submission.handedIn).toBe(false);
		expect(dara.submission.stateLabel).toBe('Not submitted');
		expect(dara.files).toEqual([]);
		expect(dara.scoreTotal).toBeNull();
		expect(dara.privateComment).toBeNull();
		// Every block of the spec is still listed, unstarted: "was asked and
		// left blank" has to be tellable from "was never asked".
		expect(dara.responses.map((r) => r.blockId)).toEqual(['f1', 't1', 'z1', 'c1', 't2', '@declaration']);
		expect(dara.responses.every((r) => r.started === false)).toBe(true);
		// Not handed in, so nothing is "unmet": that is what In progress means.
		expect(dara.completeness.unmetCount).toBe(0);
		expect(dara.completeness.complete).toBe(false);
	});
});

describe('the unmet list is specUnmet, not a second walk of the spec', () => {
	it('matches specUnmet entry for entry on handed-in work', () => {
		// THE EXPECTED VALUE COMES FROM THE PURE FUNCTION, never from the exporter.
		const expected = specUnmet(
			SPEC,
			responsesMap(RESPONSES),
			filesByBlockCount(FILES),
			APPROVALS
		);
		expect(expected.length).toBe(3); // table short, photo zone short, checklist short
		const got = alice().completeness;
		expect(got.unmetCount).toBe(expected.length);
		expect(got.unmet.map((u) => [u.kind, u.blockId, u.need, u.have])).toEqual(
			expected.map((u) => [u.kind, u.block_id, u.need, u.have])
		);
		expect(got.complete).toBe(false);
		// Each one carries the sentence a grader reads, not just a code.
		expect(got.unmet.every((u) => u.requirement.length > 10)).toBe(true);
	});
});

describe('scores, overrides and comments', () => {
	it('records the level chosen, the override, and the required comment', () => {
		const scores = alice().scores;
		const views = scores.find((s) => s.criterionId === 'm1-views')!;
		const photos = scores.find((s) => s.criterionId === 'm2-photos')!;
		expect(views.score).toBe(5);
		expect(views.override).toBe(true);
		expect(views.level).toBeNull(); // 5 lands on no level, which is what an override IS
		expect(views.comment).toBe('Third view was traced, not drawn.');
		expect(photos.override).toBe(false);
		expect(photos.level).toEqual({ index: 0, label: 'Complete', points: 6, short: 'Both sharp.' });
		expect(photos.comment).toBeNull();
	});

	it('carries the private comment and the returned state', () => {
		const s = alice();
		expect(s.privateComment).toBe('Redraw the top view before the unit test.');
		expect(s.submission.returnedToStudent).toBe(true);
		expect(s.submission.returnedAt).toBe('2026-08-21T18:00:00.000Z');
		expect(s.submission.score).toBe(11);
	});

	it('names the files attached, block by block', () => {
		expect(alice().files).toEqual([
			{ filename: 'bridge-front.png', blockId: 'z1', caption: 'Sheet 1' }
		]);
		const zone = alice().responses.find((r) => r.blockId === 'z1')!;
		expect(zone.value.count).toBe(1);
		expect(zone.value.minImages).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// IDENTITY. Asserted over the SERIALIZED BYTES, both ways, each the other's
// positive control.
// ---------------------------------------------------------------------------

describe('the identity switch', () => {
	it('states which state it is in, at the top level, in BOTH states', () => {
		expect(buildGradingExport(input({ identity: 'included' })).export.identity).toBe('included');
		expect(buildGradingExport(input({ identity: 'omitted' })).export.identity).toBe('omitted');
		expect(buildGradingExport(input({ identity: 'included' })).export.identityNote).toBe(
			IDENTITY_NOTE.included
		);
		expect(buildGradingExport(input({ identity: 'omitted' })).export.identityNote).toBe(
			IDENTITY_NOTE.omitted
		);
	});

	it('INCLUDED puts the names and addresses in the JSON (the positive control)', () => {
		const text = gradingExportJson(buildGradingExport(input({ identity: 'included' })));
		expect(text).toContain(ALICE_NAME);
		expect(text).toContain(ALICE_EMAIL);
		expect(text).toContain(DARA_NAME);
		expect(text).toContain(DARA_EMAIL);
		expect(text).toContain(TEACHER);
	});

	it('OMITTED puts no name and no address anywhere in the JSON bytes', () => {
		const text = gradingExportJson(buildGradingExport(input({ identity: 'omitted' })));
		expect(text).not.toContain(ALICE_NAME);
		expect(text).not.toContain(ALICE_EMAIL);
		expect(text).not.toContain(DARA_NAME);
		expect(text).not.toContain(DARA_EMAIL);
		// A GRADER'S ADDRESS IS AN IDENTITY TOO: `omitted` means no addresses,
		// not no STUDENT addresses.
		expect(text).not.toContain(TEACHER);
	});

	it('OMITTED still labels every student, and the label survives both scopes', () => {
		const section = buildGradingExport(input({ identity: 'omitted', scope: 'section' }));
		expect(section.assignments[0].students.map((s) => s.label)).toEqual(['Student 1', 'Student 2']);
		expect(section.assignments[0].students.every((s) => s.name === null && s.email === null)).toBe(
			true
		);
		// The label is assigned from the WHOLE roster, so it means the same
		// person in a one-student export as in the class one.
		const one = buildGradingExport(
			input({ identity: 'omitted', scope: 'student', selectedEmail: DARA_EMAIL })
		);
		expect(one.assignments[0].students[0].label).toBe('Student 2');
	});

	it('labels the roster positionally', () => {
		expect([...studentLabels(ROSTER).values()]).toEqual(['Student 1', 'Student 2']);
	});

	it('marks an anonymous file in its own name', () => {
		expect(gradingExportFilename(buildGradingExport(input({ identity: 'omitted' })), 'json')).toBe(
			'graded-bridge-sketch-idea100-period-1-block-1-class-anon.json'
		);
		expect(gradingExportFilename(buildGradingExport(input({ identity: 'included' })), 'json')).toBe(
			'graded-bridge-sketch-idea100-period-1-block-1-class.json'
		);
	});
});

// ---------------------------------------------------------------------------
// The workbook. Read back through THIS REPO'S OWN zip reader rather than a
// second parser, so the bytes are proven to be a real archive and not merely
// to be the length one would have.
// ---------------------------------------------------------------------------

/**
 * THE WORKBOOK AS A READER SEES IT, parsed back out of the bytes through
 * `$lib/xlsx-read` -- the deliberate mirror of the writer, shared with the
 * `/dev/grading-incomplete` harness so the two verification surfaces cannot
 * come to disagree about what the file says.
 *
 * NOTHING BELOW READS THE OBJECT THAT WAS PASSED IN. Rows, headers and row
 * heights all come off the inflated XML, so an assertion cannot pass because
 * the builder agreed with itself.
 */
const readXlsx = readXlsxParts;
const readWorkbook = readXlsxWorkbook;

const workbookOf = async (over: Partial<GradingExportInput> = {}) =>
	readWorkbook(await buildXlsx(gradingExportSheets(buildGradingExport(input(over)))));

describe('the spreadsheet export', () => {
	it('is a readable workbook with the parts Sheets needs', async () => {
		const parts = await readXlsx(await buildXlsx(gradingExportSheets(buildGradingExport(input()))));
		// Seven sheets now: the five fixed ones plus one per table block.
		expect([...parts.keys()].filter((k) => k.startsWith('xl/worksheets/'))).toHaveLength(7);
		expect(parts.has('[Content_Types].xml')).toBe(true);
		expect(parts.has('_rels/.rels')).toBe(true);
		expect(parts.has('xl/styles.xml')).toBe(true);
		// A frozen header row and an autofilter are what make it readable rather
		// than merely openable.
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain('state="frozen"');
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain('<autoFilter');
		expect(parts.get('xl/_rels/workbook.xml.rels')).toContain('Target="styles.xml"');
	});

	it('names one sheet per table block, from the block’s own module', async () => {
		const wb = await workbookOf();
		expect([...wb.keys()]).toEqual([
			'Grades',
			'Unmet checks',
			'Responses',
			'Three Views',
			'Photo Evidence',
			'Files',
			'About this export'
		]);
	});

	/**
	 * THE DEFECT THIS BUNDLE FIXES. A table used to be one string in one cell,
	 * column labels and values joined by pipes and rows joined by newlines.
	 * The header row below is read out of the produced bytes: real columns.
	 */
	it('gives a table block real columns, read back out of the bytes', async () => {
		const wb = await workbookOf();
		expect(wb.get('Three Views')!.header).toEqual(['Student', 'Name', 'Row', 'Member', 'Loading']);
		expect(wb.get('Photo Evidence')!.header).toEqual([
			'Student',
			'Name',
			'Row',
			'Component',
			'What you selected',
			'Why it clears'
		]);
	});

	it('gives a table row a real row, blank rows dropped', async () => {
		const wb = await workbookOf();
		// t1: two stored rows, one of them blank ('' and '  '), so one survives.
		const views = wb.get('Three Views')!;
		expect(views.rows).toHaveLength(1);
		expect(views.rows[0].slice(0, 5)).toEqual([
			'Student 1',
			`Alice ${ALICE_NAME}`,
			'1',
			'Lower chord',
			'Tension'
		]);
		// t2: three stored rows, one all-blank. The PARTLY filled one stays whole.
		const photos = wb.get('Photo Evidence')!;
		expect(photos.rows).toHaveLength(2);
		expect(photos.rows.map((r) => r[3])).toEqual(['Arm Stock', 'Speed Reduction']);
		expect(photos.rows[1].slice(4)).toEqual(['WCP 1 Motor Gear Box', '']);
		// The row NUMBER is the kept-row ordinal, so it lines up with what is there.
		expect(photos.rows.map((r) => r[2])).toEqual(['1', '2']);
	});

	/**
	 * THE EXPECTED VALUE COMES FROM THE FIXTURE THROUGH `tableRowFilled`, the
	 * same predicate `blockProgress` counts a table's progress with, never from
	 * the exporter. Two blanks: one trailing row on each table.
	 */
	it('drops exactly the all-blank rows, and says how many inside the file', async () => {
		const stored = RESPONSES.filter((r) => r.block_id === 't1' || r.block_id === 't2').flatMap(
			(r) => r.value.rows ?? []
		);
		const blanks = stored.filter((r) => !tableRowFilled(r)).length;
		expect(stored).toHaveLength(5);
		expect(blanks).toBe(2);

		const wb = await workbookOf();
		const kept = wb.get('Three Views')!.rows.length + wb.get('Photo Evidence')!.rows.length;
		expect(kept).toBe(stored.length - blanks);

		const about = wb.get('About this export')!;
		const line = about.rows.find((r) => r[0] === 'Blank table rows dropped');
		expect(line?.[1]).toContain(`${blanks} (`);
		expect(about.rows.find((r) => r[0] === 'Table blocks')?.[1]).toBe('2');
		expect(about.rows.find((r) => r[0] === 'Table layout')?.[1]).toContain('One sheet per table block');
	});

	it('leaves a POINTER on the Responses sheet, never the old dump', async () => {
		const wb = await workbookOf();
		const responses = wb.get('Responses')!;
		const alice = responses.rows.filter((r) => r[0] === 'Student 1');
		const t2 = alice.find((r) => r[3] === 't2')!;
		expect(t2[7]).toBe('2 rows, in the "Photo Evidence" sheet.');
		expect(wb.get('Responses')!.rows.find((r) => r[0] === 'Student 1' && r[3] === 't1')?.[7]).toBe(
			'1 row, in the "Three Views" sheet.'
		);
		// A student with nothing in the table says so rather than pointing at
		// rows that are not there.
		expect(responses.rows.find((r) => r[0] === 'Student 2' && r[3] === 't1')?.[7]).toBe(
			'No rows filled in.'
		);
		// AND THE OLD RENDERING IS GONE from every cell of the sheet.
		const everyCell = responses.rows.flat().join('\n');
		expect(everyCell).not.toContain('Member: Lower chord | Loading: Tension');
		expect(everyCell).not.toContain(' | ');
		// The non-table blocks are untouched.
		expect(responses.rows.find((r) => r[0] === 'Student 1' && r[3] === 'c1')?.[7]).toBe(
			'[x] Dated\n[ ] Named'
		);
	});

	/**
	 * WHAT A STUDENT WROTE IS CARRIED VERBATIM, LaTeX INCLUDED. The export
	 * renders; it never rewrites. Asserted on the bytes, so an escaping bug in
	 * the writer would show up here too.
	 */
	it('carries a paragraph, and its LaTeX, exactly as the student typed it', async () => {
		const wb = await workbookOf();
		const cell = wb.get('Photo Evidence')!.rows[0][5];
		expect(cell).toBe(PARAGRAPH);
		expect(cell).toContain('$\\sigma = F/A$');
	});

	it('caps every row height and still wraps', async () => {
		const wb = await workbookOf();
		const all = [...wb.values()].flatMap((s) => s.heights.filter((h): h is number => h != null));
		expect(all.length).toBeGreaterThan(0);
		expect(Math.max(...all)).toBeLessThanOrEqual(90);
		// The paragraph row is the one that would have run away, so it must
		// actually be AT the cap rather than merely under it.
		const photos = wb.get('Photo Evidence')!;
		expect(photos.heights[0]).toBe(90);
		expect(photos.heights[1]).toBe(15);
	});

	it('falls back to one long-form sheet past the table-sheet threshold', async () => {
		const many: AssignmentSpec = {
			...SPEC,
			modules: Array.from({ length: MAX_TABLE_SHEETS + 1 }, (_, i) => ({
				id: `mm${i}`,
				title: `Unit ${i}`,
				points: 1,
				blocks: [
					{
						type: 'table' as const,
						id: `tt${i}`,
						columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]
					}
				]
			}))
		};
		const rows = Array.from({ length: MAX_TABLE_SHEETS + 1 }, (_, i) => ({
			item_id: ITEM_ID,
			student_email: ALICE_EMAIL,
			block_id: `tt${i}`,
			value: { rows: [{ a: `a${i}`, b: `b${i}` }] }
		}));
		const roster: StudentWork[] = [{ ...ROSTER[0], responses: rows }];
		const wb = await workbookOf({ spec: many, rubric: [], roster, scope: 'section' });
		const names = [...wb.keys()];
		expect(names).toEqual(['Grades', 'Unmet checks', 'Responses', 'Table rows', 'Files', 'About this export']);
		const long = wb.get('Table rows')!;
		expect(long.header).toEqual(['Student', 'Name', 'Block', 'Table', 'Row', 'Column', 'Value']);
		// One row per CELL: nine blocks, one row each, two columns.
		expect(long.rows).toHaveLength((MAX_TABLE_SHEETS + 1) * 2);
		expect(long.rows[0].slice(2)).toEqual(['tt0', 'Unit 0', '1', 'A', 'a0']);
		expect(wb.get('About this export')!.rows.find((r) => r[0] === 'Table layout')?.[1]).toContain(
			'Table rows'
		);
		expect(
			wb.get('Responses')!.rows.find((r) => r[3] === 'tt0')?.[7]
		).toBe('1 row, in the "Table rows" sheet.');
	});

	it('deduplicates two table blocks that would take the same tab name', async () => {
		const twoInOne: AssignmentSpec = {
			...SPEC,
			modules: [
				{
					...SPEC.modules[0],
					blocks: [
						...SPEC.modules[0].blocks,
						{
							type: 'table' as const,
							id: 't3',
							columns: [{ key: 'x', label: 'X' }]
						}
					]
				}
			]
		};
		const roster: StudentWork[] = [
			{
				...ROSTER[0],
				responses: [
					{ item_id: ITEM_ID, student_email: ALICE_EMAIL, block_id: 't1', value: { rows: [{ member: 'A', loading: 'B' }] } },
					{ item_id: ITEM_ID, student_email: ALICE_EMAIL, block_id: 't3', value: { rows: [{ x: 'y' }] } }
				]
			}
		];
		const wb = await workbookOf({ spec: twoInOne, rubric: [], roster, scope: 'section' });
		expect([...wb.keys()]).toContain('Three Views');
		expect([...wb.keys()]).toContain('Three Views 2');
	});

	it('sanitises and truncates a tab name the format would refuse', () => {
		expect(sheetName('Unit 3: Bill of Materials / Costing')).toBe(
			'Unit 3  Bill of Materials   Cos'
		);
		expect(sheetName('Unit 3: Bill of Materials / Costing').length).toBeLessThanOrEqual(31);
		expect(sheetName('   ')).toBe('Sheet');
	});

	it('INCLUDED carries the identity columns and the names (the positive control)', async () => {
		const parts = await readXlsx(
			await buildXlsx(gradingExportSheets(buildGradingExport(input({ identity: 'included' }))))
		);
		const all = [...parts.values()].join('');
		expect(all).toContain('Email');
		expect(all).toContain(ALICE_NAME);
		expect(all).toContain(ALICE_EMAIL);
		expect(all).toContain(DARA_NAME);
	});

	it('OMITTED carries no name and no address in any part of the workbook', async () => {
		const parts = await readXlsx(
			await buildXlsx(gradingExportSheets(buildGradingExport(input({ identity: 'omitted' }))))
		);
		const all = [...parts.values()].join('');
		expect(all).not.toContain(ALICE_NAME);
		expect(all).not.toContain(ALICE_EMAIL);
		expect(all).not.toContain(DARA_NAME);
		expect(all).not.toContain(DARA_EMAIL);
		expect(all).not.toContain(TEACHER);
		// The identity COLUMN is gone too, not merely blanked.
		expect(all).not.toContain('>Email<');
		// And the labels are still there, so the sheet is still per student.
		expect(all).toContain('Student 1');
		expect(all).toContain('Student 2');
	});

	/** The table sheets are new surface for the identity switch, so they are
	 *  asserted on their own rather than only inside the whole-file sweep. */
	it('OMITTED drops the Name column from a TABLE sheet too', async () => {
		const wb = await workbookOf({ identity: 'omitted' });
		expect(wb.get('Three Views')!.header).toEqual(['Student', 'Row', 'Member', 'Loading']);
		expect(wb.get('Three Views')!.rows[0]).toEqual(['Student 1', '1', 'Lower chord', 'Tension']);
	});

	it('says inside itself what it is and whether it carries names', async () => {
		for (const identity of ['included', 'omitted'] as const) {
			const wb = await workbookOf({ identity });
			const about = wb.get('About this export')!;
			const flat = about.rows.flat().join(' ');
			expect(flat).toContain('Identity note');
			expect(flat).toContain(identity === 'included' ? 'Names included' : 'Names omitted');
			expect(flat).toContain('Bridge Sketch');
		}
	});

	it('lists every roster student on the Grades sheet, empty record included', () => {
		const sheets = gradingExportSheets(buildGradingExport(input()));
		const grades = sheets[0];
		expect(grades.name).toBe('Grades');
		expect(grades.rows).toHaveLength(2);
		expect(grades.rows[1][0]).toBe('Student 2');
		// One column pair per criterion, so a level is readable beside a number.
		expect(grades.header).toContain('Three Views: Views complete: level');
		expect(grades.header).toContain('Photo Evidence: Photos legible (/6)');
	});

	it('puts one row per unmet check on its own sheet', () => {
		const unmet = gradingExportSheets(buildGradingExport(input()))[1];
		expect(unmet.name).toBe('Unmet checks');
		expect(unmet.rows).toHaveLength(3);
		expect(unmet.rows.every((r) => String(r[0]).startsWith('Student '))).toBe(true);
	});
});
