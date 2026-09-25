/**
 * THE SPEC-PATH CHARACTERIZATION OF THE GRADED-WORK EXPORT (ledger 0298, R24).
 *
 * THIS FILE IS THE SHARED CASE GENERATOR, and that is the point, exactly as
 * `tests/panzoom-cases.ts` is for the pan/zoom engine. The outputs in
 * `tests/fixtures/grading-export-golden.json` were produced by running these
 * exact inputs through `src/lib/classroom/grading-export.ts` AS IT STOOD
 * BEFORE the ported-worksheet (schema 3) path was added to it -- at
 * `83be5b9e`, the export module last touched by `6782861e` -- by a throwaway
 * test that wrote the file and was then deleted. `tests/grading-export-golden.test.ts`
 * replays the same inputs through the current module and requires every byte
 * of the JSON, every cell of every sheet, and the SHA-256 of the workbook to
 * match.
 *
 * WHY IT EXISTS. R24 teaches the export a second walk (the manifest) beside the
 * spec walk, and the instruction was that the spec path must export
 * byte-identically to before. A sweep written after the change only proves
 * the new code agrees with itself; these bytes predate it.
 *
 * EVERY INPUT HERE IS A SPEC ASSIGNMENT OR AN ASSIGNMENT WITH NEITHER A SPEC NOR
 * A MANIFEST, and none carries a manifest, so the cases can be handed to the
 * old `GradingExportInput` and the new one alike. The spread is deliberate
 * rather than hand-picked around the change: every interactive spec block
 * type, the declaration, an approval gate, an override with its note, extra
 * credit, a resubmit and an edit after grading, a student with nothing, both
 * scopes, both identity states, the long-form table fallback past
 * `MAX_TABLE_SHEETS`, and the "No spec" branch.
 */
import { createHash } from 'node:crypto';
import { buildXlsx } from '../src/lib/xlsx';
import {
	buildGradingExport,
	gradingExportFilename,
	gradingExportJson,
	gradingExportSheets,
	type GradingExportInput
} from '../src/lib/classroom/grading-export';
import {
	rubricFromSpec,
	type AssignmentSpec,
	type ResponseRow,
	type StudentWork,
	type SubmissionFileRow,
	type SubmissionRow
} from '../src/lib/classroom/assignment-spec';
import type { ClassroomItem, ClassroomSection } from '../src/lib/classroom/classroom';

const ITEM_ID = 'i-golden';
const TEACHER = 'teacher@boscotech.edu';

export const GOLDEN_SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'idea100-golden', title: 'Truss Lab', totalPoints: 20 },
	modules: [
		{
			id: 'm1',
			title: 'Load Path',
			points: 10,
			blocks: [
				{ type: 'instructions', content: 'Trace the load.' },
				{ type: 'textField', id: 'f1', prompt: 'Where does the load go first?', minSentences: 2 },
				{
					type: 'table',
					id: 't1',
					columns: [
						{ key: 'member', label: 'Member' },
						{ key: 'force', label: 'Force (N)' }
					],
					minRows: 2
				}
			],
			rubric: [
				{
					id: 'path',
					criterion: 'Load path traced',
					levels: [
						{ points: 10, label: 'Complete', short: 'Every member', descriptor: 'Every member named.' },
						{ points: 5, label: 'Partial', descriptor: 'Some members.' },
						{ points: 0, label: 'Absent', descriptor: 'None.' }
					]
				}
			]
		},
		{
			id: 'm2',
			title: 'Evidence',
			points: 10,
			blocks: [
				{ type: 'imageZone', id: 'z1', minImages: 2, captions: true },
				{ type: 'checklist', id: 'c1', items: ['Dated', 'Named', 'Scaled'] },
				{
					type: 'table',
					id: 't2',
					columns: [
						{ key: 'part', label: 'Part' },
						{ key: 'why', label: 'Why it holds' }
					]
				}
			],
			rubric: [
				{
					id: 'photos',
					criterion: 'Photos legible',
					levels: [
						{ points: 10, label: 'Complete', descriptor: 'Both sharp.' },
						{ points: 5, label: 'Partial', descriptor: 'One usable.' },
						{ points: 0, label: 'Absent', descriptor: 'None.' }
					]
				}
			]
		}
	],
	declarations: { academicIntegrity: true },
	approvalGate: { afterModule: 'm1', label: 'Load path check' }
};

const SECTION: ClassroomSection = {
	id: 's-golden',
	course_id: 'c-1',
	label: 'Period 3',
	block: '3',
	teacher_email: TEACHER,
	active: true,
	course: { id: 'c-1', code: 'IDEA100', title: 'Engineering Essentials', active: true }
};

const ITEM: ClassroomItem = {
	id: ITEM_ID,
	kind: 'assignment',
	title: 'Truss Lab',
	body: 'Trace it.',
	body_doc: null,
	points: 20,
	due_at: '2026-09-01T06:59:00.000Z',
	category: 'Unit Labs',
	author_email: TEACHER,
	author_name: 'A. Pina',
	published: true,
	pinned: false,
	sort_order: 0,
	first_published_at: '2026-08-25T07:00:00.000Z',
	edited_at: null,
	created_at: '2026-08-25T07:00:00.000Z',
	updated_at: '2026-08-25T07:00:00.000Z',
	links: [],
	attachments: [],
	postings: []
};

function submission(
	over: Partial<SubmissionRow> & Pick<SubmissionRow, 'id' | 'student_email' | 'state'>
): SubmissionRow {
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

const response = (email: string, block: string, value: ResponseRow['value'], at?: string): ResponseRow => ({
	item_id: ITEM_ID,
	student_email: email,
	block_id: block,
	value,
	...(at ? { updated_at: at } : {})
});

const ADA = 'ada.okafor@boscotech.net';
const BEN = 'ben.lindqvist@boscotech.net';
const CAL = 'cal.reyes@boscotech.net';

/** Ada: returned, an override with its note, extra credit, EDITED AND RESUBMITTED after grading. */
const ADA_WORK: StudentWork = {
	email: ADA,
	displayName: 'Ada Okafor',
	active: true,
	submission: submission({
		id: 'sub-ada',
		student_email: ADA,
		state: 'returned',
		submitted_at: '2026-09-03T18:00:00.000Z',
		returned_at: '2026-09-02T18:00:00.000Z',
		rubric_scores: { 'm1-path': 7, 'm2-photos': 10 },
		criterion_comments: { 'm1-path': 'The bottom chord is missing.' },
		score: 19,
		extra_credit: 2,
		teacher_comment: 'Name the bottom chord next time.',
		graded_by: TEACHER,
		graded_at: '2026-09-02T18:00:00.000Z'
	}),
	responses: [
		response(ADA, 'f1', { text: 'It goes into the top chord. Then it splits at the first node.' }, '2026-09-01T02:00:00.000Z'),
		response(
			ADA,
			't1',
			{
				rows: [
					{ member: 'Top chord', force: '420' },
					{ member: 'Diagonal A', force: '' },
					{ member: '', force: ' ' }
				]
			},
			'2026-09-04T01:00:00.000Z'
		),
		response(
			ADA,
			't2',
			{ rows: [{ part: 'Gusset', why: 'Two bolts, and the plate is thicker than the member.\nIt held at 40 kg.' }] },
			'2026-09-01T02:00:00.000Z'
		),
		response(ADA, 'c1', { checked: [true, true, false] }, '2026-09-01T02:00:00.000Z'),
		response(ADA, '@declaration', { checked: [true] }, '2026-09-01T02:00:00.000Z')
	],
	files: [
		{
			id: 'ada-img-1',
			submission_id: 'sub-ada',
			block_id: 'z1',
			caption: 'Front',
			filename: 'truss-front.jpg',
			mime_type: 'application/octet-stream',
			storage_key: 'sub-ada/ada-img-1.jpg'
		},
		{
			id: 'ada-img-2',
			submission_id: 'sub-ada',
			block_id: null,
			caption: null,
			filename: 'notes.pdf',
			mime_type: 'application/octet-stream',
			storage_key: 'sub-ada/ada-img-2.pdf'
		}
	] as SubmissionFileRow[],
	approvals: [{ item_id: ITEM_ID, student_email: ADA, module_id: 'm1' }]
};

/** Ben: turned in (not graded), short on everything, no approval. */
const BEN_WORK: StudentWork = {
	email: BEN,
	displayName: 'Ben Lindqvist',
	active: true,
	submission: submission({
		id: 'sub-ben',
		student_email: BEN,
		state: 'submitted',
		submitted_at: '2026-09-01T05:00:00.000Z'
	}),
	responses: [response(BEN, 'f1', { text: 'Down.' }, '2026-09-01T04:00:00.000Z')],
	files: [],
	approvals: []
};

/** Cal: nothing at all, and no longer enrolled. */
const CAL_WORK: StudentWork = {
	email: CAL,
	displayName: 'Cal Reyes',
	active: false,
	submission: null,
	responses: [],
	files: [],
	approvals: []
};

const ROSTER = [ADA_WORK, BEN_WORK, CAL_WORK];

const NOW = new Date('2026-09-05T15:04:05.000Z');

/** A spec with nine table blocks, which is past `MAX_TABLE_SHEETS` (8). */
function manyTablesSpec(): AssignmentSpec {
	const tables = Array.from({ length: 9 }, (_, i) => ({
		type: 'table' as const,
		id: `tt${i + 1}`,
		columns: [
			{ key: 'a', label: 'Alpha' },
			{ key: 'b', label: 'Beta' }
		]
	}));
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'idea100-tables', title: 'Tables', totalPoints: 5 },
		modules: [
			{
				id: 'mt',
				title: 'Nine Tables',
				points: 5,
				blocks: tables,
				rubric: [
					{
						id: 'done',
						criterion: 'Done',
						levels: [
							{ points: 5, label: 'Done', descriptor: 'Done.' },
							{ points: 0, label: 'Not', descriptor: 'Not.' }
						]
					}
				]
			}
		]
	};
}

export interface GoldenCase {
	name: string;
	input: GradingExportInput;
}

export function goldenCases(): GoldenCase[] {
	const base = (over: Partial<GradingExportInput>): GradingExportInput => ({
		section: SECTION,
		item: ITEM,
		spec: GOLDEN_SPEC,
		rubric: rubricFromSpec(GOLDEN_SPEC),
		roster: ROSTER,
		selectedEmail: ADA,
		scope: 'section',
		identity: 'included',
		now: NOW,
		...over
	});
	const tables = manyTablesSpec();
	const tableRoster: StudentWork[] = [
		{
			...ADA_WORK,
			submission: null,
			approvals: [],
			files: [],
			responses: tables.modules[0].blocks.map((b, i) =>
				response(ADA, (b as { id: string }).id, { rows: [{ a: `a${i}`, b: `b${i}` }, { a: '', b: '' }] })
			)
		}
	];
	return [
		{ name: 'spec section included', input: base({}) },
		{ name: 'spec section omitted', input: base({ identity: 'omitted' }) },
		{ name: 'spec student included', input: base({ scope: 'student' }) },
		{ name: 'spec student omitted', input: base({ scope: 'student', identity: 'omitted' }) },
		{ name: 'spec student not selected', input: base({ scope: 'student', selectedEmail: null }) },
		{
			name: 'no spec, no rubric, section included',
			input: base({ spec: null, rubric: null })
		},
		{
			name: 'no spec, rubric kept, section omitted',
			input: base({ spec: null, identity: 'omitted' })
		},
		{
			name: 'nine tables, long-form sheet',
			input: base({ spec: tables, rubric: rubricFromSpec(tables), roster: tableRoster })
		},
		{ name: 'empty roster', input: base({ roster: [] }) }
	];
}

/** Everything a case renders to, in a shape JSON can hold and a diff can read. */
export interface GoldenOutput {
	json: string;
	sheets: string;
	xlsxSha256: string;
	jsonFilename: string;
	xlsxFilename: string;
}

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

export async function renderCase(input: GradingExportInput): Promise<GoldenOutput> {
	const payload = buildGradingExport(input);
	const sheets = gradingExportSheets(payload);
	return {
		json: gradingExportJson(payload),
		sheets: JSON.stringify(sheets),
		xlsxSha256: sha256(await buildXlsx(sheets)),
		jsonFilename: gradingExportFilename(payload, 'json'),
		xlsxFilename: gradingExportFilename(payload, 'xlsx')
	};
}
