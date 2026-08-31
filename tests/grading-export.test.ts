import { describe, expect, it } from 'vitest';
import {
	IDENTITY_NOTE,
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
	type AssignmentSpec,
	type ModuleApprovalRow,
	type ResponseRow,
	type StudentWork,
	type SubmissionFileRow,
	type SubmissionRow
} from '../src/lib/classroom/assignment-spec';
import type { ClassroomItem, ClassroomSection } from '../src/lib/classroom/classroom';
import { buildXlsx } from '../src/lib/xlsx';
import { inflateEntry, readCentralDirectory } from '../src/lib/foundry/zip';

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
				{ type: 'checklist', id: 'c1', items: ['Dated', 'Named'] }
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
		value: { rows: [{ member: 'Lower chord', loading: 'Tension' }] }
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
		expect(dara.responses.map((r) => r.blockId)).toEqual(['f1', 't1', 'z1', 'c1', '@declaration']);
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

async function readXlsx(bytes: Uint8Array): Promise<Map<string, string>> {
	const records = readCentralDirectory(bytes);
	expect(records).not.toBeNull();
	const out = new Map<string, string>();
	for (const rec of records!) {
		if (rec.directory) continue;
		const raw = await inflateEntry(bytes, rec, rec.name);
		out.set(rec.name, new TextDecoder().decode(raw));
	}
	return out;
}

describe('the spreadsheet export', () => {
	it('is a readable workbook with the parts Sheets needs', async () => {
		const parts = await readXlsx(await buildXlsx(gradingExportSheets(buildGradingExport(input()))));
		expect([...parts.keys()].sort()).toEqual([
			'[Content_Types].xml',
			'_rels/.rels',
			'xl/_rels/workbook.xml.rels',
			'xl/styles.xml',
			'xl/workbook.xml',
			'xl/worksheets/sheet1.xml',
			'xl/worksheets/sheet2.xml',
			'xl/worksheets/sheet3.xml',
			'xl/worksheets/sheet4.xml',
			'xl/worksheets/sheet5.xml'
		]);
		const wb = parts.get('xl/workbook.xml')!;
		for (const name of ['Grades', 'Unmet checks', 'Responses', 'Files', 'About this export']) {
			expect(wb).toContain(`name="${name}"`);
		}
		// A frozen header row and an autofilter are what make it readable rather
		// than merely openable.
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain('state="frozen"');
		expect(parts.get('xl/worksheets/sheet1.xml')).toContain('<autoFilter');
		// Every sheet relationship plus styles.
		expect(parts.get('xl/_rels/workbook.xml.rels')).toContain('Target="styles.xml"');
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

	it('says inside itself what it is and whether it carries names', async () => {
		for (const identity of ['included', 'omitted'] as const) {
			const parts = await readXlsx(
				await buildXlsx(gradingExportSheets(buildGradingExport(input({ identity }))))
			);
			const about = parts.get('xl/worksheets/sheet5.xml')!;
			expect(about).toContain('Identity note');
			expect(about).toContain(identity === 'included' ? 'Names included' : 'Names omitted');
			expect(about).toContain('Bridge Sketch');
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
