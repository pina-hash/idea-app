/**
 * THE GRADED-WORK EXPORT: one assignment's graded work, shaped so a language
 * model reading it cold can tell what was asked, what was handed in, and how it
 * was scored -- without being told any of that separately.
 *
 * IT ADDS NO READ. Everything here is derived from what `GradingConsole` is
 * already handed: the section and item rows, the stored spec, the stored
 * rubric, and the `GradingData` its own `loadGrading` transport returned. So
 * the export is by construction EXACTLY what the caller can already see through
 * the console -- the RLS that scoped that payload (`classroom_can_review_submission`
 * plus the roster read) is the whole gate, there is no service role anywhere near
 * it, and no definer function was written for it. A scope that would need a
 * wider read is a scope this module does not have.
 *
 * WHY JSON RATHER THAN THE FACTS CSV BESIDE IT. `gradesCsv` answers a
 * gradebook's question -- last name, first name, score, out of -- and is
 * deliberately four columns wide because a grade import wants exactly four. A
 * model asked to read the WORK needs the spec, the rubric, the responses block
 * by block and the unmet checks, none of which is a column. They are two
 * different exports and neither is a widening of the other.
 *
 * -------------------------------------------------------------------------
 * IDENTITY IS A SWITCH AND IT IS RECORDED INSIDE THE FILE.
 *
 * The file leaves the school's systems the moment it is pasted into a
 * third-party tool, so whether it carries names is a decision somebody makes
 * rather than a property of a file format. `identity: 'included'` is the
 * default because it is what the teacher of record asked for and because a
 * model reasoning about a class is more useful when it can name a student;
 * `identity: 'omitted'` replaces every name, every email address and every
 * grader address with the student's LABEL.
 *
 * THE LABEL IS ASSIGNED FROM THE WHOLE ROSTER, NOT FROM WHAT WAS EXPORTED, so
 * `Student 3` means the same person in a one-student export and in that same
 * assignment's section export. It is stable within a section and resolves to
 * nobody outside one.
 *
 * `export.identity` and `export.identityNote` are top-level and always
 * present, in BOTH states -- a file that says nothing about whether it carries
 * names is a file somebody will assume the wrong thing about. The workbook
 * carries the same two lines on its own "About this export" sheet, because a
 * spreadsheet passed around loses whatever the JSON said.
 * -------------------------------------------------------------------------
 */
import {
	DECLARATION_BLOCK_ID,
	DECLARATION_TEXT,
	blockStarted,
	countSentences,
	criterionMax,
	filesByBlockCount,
	isOverrideScore,
	levelIndexForScore,
	levelShort,
	responsesMap,
	rubricTotal,
	specUnmet,
	splitLastFirst,
	submissionStateLabel,
	tableRowFilled,
	unmetLabel,
	type AssignmentSpec,
	type InteractiveBlock,
	type RubricCriterion,
	type SpecBlock,
	type SpecModule,
	type StudentWork,
	type UnmetEntry
} from './assignment-spec';
import { itemTitle, sectionTitle, type ClassroomItem, type ClassroomSection } from './classroom';
import { sheetName, type XlsxSheet } from '$lib/xlsx';

// ---------------------------------------------------------------------------
// DID THE WORK CHANGE AFTER IT WAS GRADED
// ---------------------------------------------------------------------------

/**
 * WHAT A STUDENT DID TO GRADED WORK, AND IT IS DERIVED RATHER THAN STORED.
 *
 * A grade is a statement about a particular state of the work, and today
 * nothing tells the instructor when the work stopped being that state. Two
 * different acts produce it and an instructor answers them differently:
 *
 *   `resubmitted` -- the student handed it in AGAIN after the grade landed.
 *     `classroom_submit_assignment` refuses only a row already in state
 *     `submitted`, so a RETURNED row can be submitted over, and since 0160 it
 *     is accepted even when the preflight considers it unfinished. The whole
 *     act is deliberate and the instructor is being asked to look again.
 *
 *   `edited` -- a response block was autosaved over after the grade landed.
 *     `classroom_save_response` refuses only state `submitted`, so a returned
 *     assignment is editable again and every keystroke burst lands silently.
 *     Nobody asked for anything; the graded artefact simply is not the graded
 *     artefact any more.
 *
 * BOTH CAN BE TRUE AT ONCE and the list carries both, because collapsing them
 * to the weaker word ("changed") throws away the half that says whether a
 * person meant it.
 *
 * IT IS A COMPARISON, NEVER A COLUMN. There is no flag for a writer to set and
 * therefore none for a writer to forget: `classroom_save_response` and
 * `classroom_add_submission_file` do not touch the submission row at all
 * (measured -- an autosave leaves `classroom_submissions.updated_at` exactly
 * where the grade left it), so a stored boolean would have to be maintained by
 * a path that has no reason to know grading exists.
 *
 * AND IT CLEARS ITSELF. `classroom_grade_submission` stamps `graded_at = now()`
 * on EVERY write including a regrade, so the moment the instructor grades again
 * the comparison is against a later instant and every kind falls away. A signal
 * that cannot clear is a signal that is ignored inside a week.
 *
 * WHAT IT DOES NOT SEE, stated rather than left to be discovered:
 *   * A FILE ATTACHED AFTER GRADING. `classroom_submission_files.created_at`
 *     exists and would answer it, but the column is not in
 *     `SUBMISSION_FILE_SELECT` and `SubmissionFileRow` has no field for it, so
 *     no payload on either surface carries it today.
 *   * A FILE REMOVED after grading. Nothing records a deletion, so no read can
 *     derive it and no widening of this function would.
 *   * A RESPONSE that was edited and then edited BACK. `updated_at` is a
 *     timestamp, not a diff; the work may be byte-identical to what was graded.
 *     The sentence says the work was TOUCHED after grading, which is exactly
 *     what the data supports.
 */
export type PostGradeChangeKind = 'resubmitted' | 'edited';

export interface PostGradeChange {
	/** Every act that happened after `gradedAt`, in the order above. Never empty. */
	kinds: PostGradeChangeKind[];
	/** The MOST RECENT of them, ISO. A bare flag sends the instructor hunting. */
	at: string;
	/** The instant it is measured against, ISO: the grade this outran. */
	gradedAt: string;
}

/** Milliseconds, or null for absent/unparseable. */
function instant(value: string | null | undefined): number | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

/**
 * The one implementation. Null means "nothing to report", which covers three
 * genuinely different situations that all warrant silence: no submission row,
 * a row that has never been graded (there is no instant to be after), and a
 * row whose work has not moved since.
 *
 * AN UNPARSEABLE OR MISSING TIMESTAMP DOES NOT FIRE. A response row whose
 * `updated_at` did not arrive contributes nothing rather than counting as a
 * change -- an integrity mark that cries wolf is one an instructor learns to
 * click past, which costs the case it exists for. The select behind both
 * grading reads names `updated_at` unconditionally (it is a 0086 column, not a
 * rung), so in practice the value is always there.
 */
export function postGradeChange(work: {
	submission: { graded_at?: string | null; submitted_at?: string | null } | null;
	responses: { updated_at?: string }[];
}): PostGradeChange | null {
	const gradedAt = work.submission?.graded_at ?? null;
	const graded = instant(gradedAt);
	if (graded == null || !gradedAt) return null;

	const kinds: PostGradeChangeKind[] = [];
	let latest = 0;

	const submitted = instant(work.submission?.submitted_at);
	if (submitted != null && submitted > graded) {
		kinds.push('resubmitted');
		latest = Math.max(latest, submitted);
	}

	let lastEdit = 0;
	for (const r of work.responses ?? []) {
		const ms = instant(r.updated_at);
		if (ms != null && ms > graded) lastEdit = Math.max(lastEdit, ms);
	}
	if (lastEdit > 0) {
		kinds.push('edited');
		latest = Math.max(latest, lastEdit);
	}

	if (!kinds.length) return null;
	return { kinds, at: new Date(latest).toISOString(), gradedAt };
}

/**
 * THE WORDS, in one place, so the chip, the detail line and the export cannot
 * describe the same fact differently. Names the ACT, never just "changed".
 */
export function postGradeChangeLabel(change: PostGradeChange): string {
	if (change.kinds.length === 2) return 'Resubmitted and edited after grading';
	return change.kinds[0] === 'resubmitted' ? 'Resubmitted after grading' : 'Edited after grading';
}

export const GRADING_EXPORT_SCHEMA = 1;

export type ExportIdentity = 'included' | 'omitted';
/**
 * `student` is the selected student on one assignment; `section` is every
 * roster student on one assignment. A third scope -- every assignment for a
 * whole section -- is deliberately absent: it needs a list of the section's
 * assignments and a spec, a rubric and a grading payload per assignment, none
 * of which this component is handed, so it is a different query shape rather
 * than another argument here.
 */
export type ExportScope = 'student' | 'section';

export const IDENTITY_NOTE: Record<ExportIdentity, string> = {
	included:
		'Student names and email addresses ARE included in this file. Treat it as student records: it identifies real people.',
	omitted:
		'Student names and email addresses are NOT in this file. Each student is a label ("Student 1", "Student 2") that is consistent throughout this file and across other exports of the same class, and that cannot be resolved back to a person from this file alone.'
};

const SCOPE_NOTE: Record<ExportScope, string> = {
	student: 'One assignment, one student: the assignment as it was set, and that student’s work and grade on it.',
	section:
		'One assignment, every student on the section roster: the assignment as it was set, and each student’s work and grade on it. A student who handed in nothing is present with an empty record rather than left out.'
};

// ---------------------------------------------------------------------------
// The shape. Every field is a fact already on screen in the grading console.
// ---------------------------------------------------------------------------

export interface ExportedResponse {
	moduleId: string | null;
	moduleTitle: string | null;
	blockId: string;
	blockType: string;
	prompt: string | null;
	/** Has anything at all been entered here (`blockStarted`, not "is it enough"). */
	started: boolean;
	/** Shaped by block type; the keys differ and that is the point. */
	value: Record<string, unknown>;
}

export interface ExportedFile {
	filename: string;
	blockId: string | null;
	caption: string | null;
}

export interface ExportedUnmet {
	kind: string;
	moduleId: string | null;
	blockId: string | null;
	need: number;
	have: number;
	requirement: string;
}

export interface ExportedCriterionScore {
	criterionId: string;
	criterion: string;
	max: number;
	score: number | null;
	/** null when unscored OR when the score matches no level (an override). */
	level: { index: number; label: string; points: number; short: string } | null;
	override: boolean;
	/** The grader's per-criterion note. REQUIRED by the server on an override. */
	comment: string | null;
}

export interface ExportedStudent {
	label: string;
	name: string | null;
	email: string | null;
	enrollmentActive: boolean;
	submission: {
		state: string | null;
		stateLabel: string;
		handedIn: boolean;
		returnedToStudent: boolean;
		submittedAt: string | null;
		returnedAt: string | null;
		gradedAt: string | null;
		gradedBy: string | null;
		score: number | null;
		outOf: number;
		/**
		 * EXTRA CREDIT AWARDED BEYOND THE RUBRIC, or null where none was.
		 *
		 * Its own field rather than a criterion, because a rubric criterion's
		 * maximum is its top level's points and every criterion sums into the
		 * module total -- a criterion carrying a score outside its own range is
		 * a rubric that no longer describes how the work was scored.
		 * `score` ALREADY INCLUDES IT (the database adds it there), so this is
		 * the itemisation and never a second number to add on.
		 */
		extraCredit: number | null;
		/**
		 * `postGradeChange`'s answer for this row, or null. The export carries
		 * the derivation rather than re-deriving it: a reader of the file gets
		 * the same sentence the console showed.
		 */
		changedAfterGrading: PostGradeChange | null;
	};
	completeness: {
		/** False when the assignment has no spec: there is nothing to check against. */
		evaluated: boolean;
		complete: boolean;
		unmetCount: number;
		unmet: ExportedUnmet[];
	};
	responses: ExportedResponse[];
	files: ExportedFile[];
	scores: ExportedCriterionScore[];
	scoreTotal: number | null;
	/** `teacher_comment`: the grader's note, released to the student on return. */
	privateComment: string | null;
}

export interface ExportedAssignment {
	itemId: string;
	title: string;
	points: number | null;
	outOf: number;
	dueAt: string | null;
	category: string | null;
	authoredBy: string | null;
	/** The stored spec, verbatim. Never a summary: it is what was asked. */
	spec: AssignmentSpec | null;
	/** The stored rubric, verbatim, levels and all: it is how it was scored. */
	rubric: RubricCriterion[] | null;
	students: ExportedStudent[];
}

export interface GradingExport {
	export: {
		schemaVersion: number;
		what: string;
		scope: ExportScope;
		generatedAt: string;
		identity: ExportIdentity;
		identityNote: string;
		source: string;
		counts: { assignments: number; students: number };
	};
	section: {
		id: string;
		title: string;
		label: string;
		block: string | null;
		course: { code: string; title: string } | null;
	};
	assignments: ExportedAssignment[];
}

export interface GradingExportInput {
	section: ClassroomSection;
	item: ClassroomItem;
	spec: AssignmentSpec | null;
	rubric: RubricCriterion[] | null;
	/** The console's own roster-ordered rows (`studentWorkRows(...).rows`). */
	roster: StudentWork[];
	/** For `student` scope: which of them. Ignored for `section`. */
	selectedEmail?: string | null;
	scope: ExportScope;
	identity: ExportIdentity;
	/** Threaded in: a module that reads its own clock cannot be asserted. */
	now: Date;
}

// ---------------------------------------------------------------------------

function blockPrompt(block: SpecBlock): string | null {
	if (block.type === 'textField') return block.prompt;
	if (block.type === 'checklist') return block.items.join(' / ');
	return null;
}

/** One block's stored answer, shaped by what that kind of block holds. */
function blockValue(
	block: InteractiveBlock,
	responses: Map<string, { text?: string; rows?: Record<string, string>[]; checked?: boolean[] }>,
	files: ExportedFile[]
): Record<string, unknown> {
	const stored = responses.get(block.id) ?? {};
	if (block.type === 'textField') {
		const text = stored.text ?? '';
		return {
			text,
			sentences: countSentences(text),
			minSentences: block.minSentences ?? null
		};
	}
	if (block.type === 'table') {
		const rows = stored.rows ?? [];
		return {
			columns: block.columns.map((c) => ({ key: c.key, label: c.label })),
			rows,
			filledRows: rows.filter(
				(r) => r && typeof r === 'object' && Object.values(r).some((v) => String(v ?? '').trim() !== '')
			).length,
			minRows: block.minRows ?? null
		};
	}
	if (block.type === 'imageZone') {
		const mine = files.filter((f) => f.blockId === block.id);
		return {
			files: mine.map((f) => ({ filename: f.filename, caption: f.caption })),
			count: mine.length,
			minImages: block.minImages ?? 1
		};
	}
	// checklist
	const checked = stored.checked ?? [];
	return {
		items: block.items.map((label, i) => ({ label, checked: checked[i] === true })),
		checkedCount: checked.filter(Boolean).length,
		total: block.items.length
	};
}

function interactiveBlocks(mod: SpecModule): InteractiveBlock[] {
	return mod.blocks.filter(
		(b): b is InteractiveBlock =>
			b.type === 'textField' || b.type === 'table' || b.type === 'imageZone' || b.type === 'checklist'
	);
}

/**
 * ONE STUDENT'S RECORD, AND A STUDENT WHO DID NOTHING STILL GETS ONE.
 *
 * Every block in the spec is listed whether or not it was answered, with
 * `started: false` and an empty value, because a model reading the file has to
 * be able to tell "was not asked" from "was asked and left blank". Dropping the
 * empty ones would make a student who handed in nothing indistinguishable from
 * a student who was never set the work.
 */
function exportStudent(
	row: StudentWork,
	label: string,
	spec: AssignmentSpec | null,
	rubric: RubricCriterion[] | null,
	outOf: number,
	identity: ExportIdentity
): ExportedStudent {
	const named = identity === 'included';
	const files: ExportedFile[] = row.files.map((f) => ({
		filename: f.filename,
		blockId: f.block_id,
		caption: f.caption
	}));
	const responses = responsesMap(row.responses);
	const byBlock = filesByBlockCount(row.files);
	const state = row.submission?.state ?? null;
	const handedIn = state === 'submitted' || state === 'returned';

	const entries: ExportedResponse[] = [];
	for (const mod of spec?.modules ?? []) {
		for (const block of interactiveBlocks(mod)) {
			entries.push({
				moduleId: mod.id,
				moduleTitle: mod.title,
				blockId: block.id,
				blockType: block.type,
				prompt: blockPrompt(block),
				started: blockStarted(block, responses, byBlock),
				value: blockValue(block, responses, files)
			});
		}
	}
	if (spec?.declarations?.academicIntegrity) {
		entries.push({
			moduleId: null,
			moduleTitle: null,
			blockId: DECLARATION_BLOCK_ID,
			blockType: 'declaration',
			prompt: DECLARATION_TEXT,
			started: responses.get(DECLARATION_BLOCK_ID)?.checked?.[0] === true,
			value: { checked: responses.get(DECLARATION_BLOCK_ID)?.checked?.[0] === true }
		});
	}

	// THE UNMET LIST IS `specUnmet`, THE SAME PURE MIRROR OF
	// `_classroom_spec_unmet` THE CONSOLE'S OWN CHIP READS. A second walk of
	// the spec here is exactly the copy that stops agreeing with the screen.
	const unmetEntries: UnmetEntry[] = spec ? specUnmet(spec, responses, byBlock, row.approvals) : [];
	const savedScores = row.submission?.rubric_scores ?? {};
	const savedNotes = row.submission?.criterion_comments ?? {};
	const scores: ExportedCriterionScore[] = (rubric ?? []).map((c) => {
		const score = savedScores[c.id] ?? null;
		const index = levelIndexForScore(c, score);
		const level = index >= 0 ? c.levels?.[index] : undefined;
		return {
			criterionId: c.id,
			criterion: c.criterion,
			max: criterionMax(c),
			score: score == null ? null : Number(score),
			level: level
				? {
						index,
						label: level.label,
						points: Number(level.points),
						short: levelShort(level, c.id, spec)
					}
				: null,
			override: isOverrideScore(c, score),
			comment: savedNotes[c.id]?.trim() ? savedNotes[c.id] : null
		};
	});

	return {
		label,
		name: named ? row.displayName : null,
		email: named ? row.email : null,
		enrollmentActive: row.active,
		submission: {
			state,
			stateLabel: submissionStateLabel(row.submission?.state),
			handedIn,
			returnedToStudent: state === 'returned',
			submittedAt: row.submission?.submitted_at ?? null,
			returnedAt: row.submission?.returned_at ?? null,
			gradedAt: row.submission?.graded_at ?? null,
			// A GRADER'S ADDRESS IS AN IDENTITY TOO. It rides the same switch as
			// the students', so `omitted` really means no addresses in the file
			// rather than no STUDENT addresses in the file.
			gradedBy: named ? (row.submission?.graded_by ?? null) : null,
			score: row.submission?.score ?? null,
			outOf,
			extraCredit: row.submission?.extra_credit ?? null,
			changedAfterGrading: postGradeChange(row)
		},
		completeness: {
			evaluated: !!spec,
			// Only work that was HANDED IN can be incomplete: everyone still
			// working is unfinished by definition, which is what the console's
			// own chip already says and what its `incompleteCount` already does.
			complete: !!spec && handedIn && unmetEntries.length === 0,
			unmetCount: handedIn ? unmetEntries.length : 0,
			unmet: handedIn
				? unmetEntries.map((e) => ({
						kind: e.kind,
						moduleId: e.module_id,
						blockId: e.block_id,
						need: e.need,
						have: e.have,
						requirement: unmetLabel(spec, e)
					}))
				: []
		},
		responses: entries,
		files,
		scores,
		scoreTotal: row.submission?.score ?? null,
		privateComment: row.submission?.teacher_comment ?? null
	};
}

/** `Student <n>` from the student's place in the WHOLE roster, 1-based. */
export function studentLabels(roster: StudentWork[]): Map<string, string> {
	return new Map(roster.map((r, i) => [r.email, `Student ${i + 1}`]));
}

export function buildGradingExport(input: GradingExportInput): GradingExport {
	const { section, item, spec, rubric, roster, scope, identity, now } = input;
	const labels = studentLabels(roster);
	const chosen =
		scope === 'student'
			? roster.filter((r) => r.email === input.selectedEmail)
			: roster;
	const outOf = rubric?.length ? rubricTotal(rubric) : (item.points ?? 0);
	const students = chosen.map((row) =>
		exportStudent(row, labels.get(row.email) ?? 'Student', spec, rubric, outOf, identity)
	);

	return {
		export: {
			schemaVersion: GRADING_EXPORT_SCHEMA,
			what: SCOPE_NOTE[scope],
			scope,
			generatedAt: now.toISOString(),
			identity,
			identityNote: IDENTITY_NOTE[identity],
			source: 'IDEA portal (ideabosco.com) classroom grading console',
			counts: { assignments: 1, students: students.length }
		},
		section: {
			id: section.id,
			title: sectionTitle(section),
			label: section.label,
			block: section.block,
			course: section.course ? { code: section.course.code, title: section.course.title } : null
		},
		assignments: [
			{
				itemId: item.id,
				title: itemTitle(item),
				points: item.points ?? null,
				outOf,
				dueAt: item.due_at ?? null,
				category: item.category ?? null,
				authoredBy: identity === 'included' ? (item.author_name ?? item.author_email ?? null) : null,
				spec,
				rubric,
				students
			}
		]
	};
}

/**
 * Pretty-printed with real newlines and tabs, matching every other JSON file
 * committed here. A minified blob is what a human cannot spot-check, and
 * spot-checking it before pasting it into somebody else's tool is the whole
 * point of it being readable.
 */
export function gradingExportJson(payload: GradingExport): string {
	return JSON.stringify(payload, null, '\t') + '\n';
}

// ---------------------------------------------------------------------------
// THE WORKBOOK: the same payload as five tables, for the half of this that a
// person reads rather than a model. It is DERIVED FROM THE JSON OBJECT and not
// from the console's rows, so the two exports can never disagree about a
// number or about whether a name is in the file.
// ---------------------------------------------------------------------------

function yesNo(value: boolean): string {
	return value ? 'Yes' : 'No';
}

/**
 * HOW MANY TABLE SHEETS ARE WORTH HAVING, AND WHAT HAPPENS PAST IT.
 *
 * A sheet per table block is the readable shape -- real rows, real columns,
 * sortable and filterable -- and it is what a teacher wants when they are
 * looking at one student's bill of materials. It does not scale: the tab bar
 * stops being scannable somewhere around a dozen tabs, and five of those are
 * already spoken for (Grades, Unmet checks, Responses, Files, About).
 *
 * EIGHT, because it is comfortably past every real assignment (one to four
 * table blocks is the normal shape and the fixture's two is typical) while
 * keeping the workbook at thirteen tabs in the worst case. Past it every table
 * goes into ONE long-form sheet instead -- student, block, row number, column,
 * value, one row per cell -- which is less pleasant to scan and works for any
 * number of blocks with any columns. The About sheet says which shape this
 * particular file took, so nobody has to infer it from the tab bar.
 */
export const MAX_TABLE_SHEETS = 8;

/** The tallest a body row may get. Six wrapped lines at 15pt. */
export const MAX_ROW_HEIGHT_PT = 90;

/** Sheets whose names are spoken for before any table block gets one. */
const RESERVED_SHEETS = [
	'Grades',
	'Unmet checks',
	'Responses',
	'Files',
	'About this export',
	'Table rows'
];

/** One table block, gathered across every student in the export. */
interface TableBlockSheet {
	blockId: string;
	label: string;
	columns: { key: string; label: string }[];
	/** Assigned later: empty in the long-form shape. */
	sheet: string;
	/** `{ student, rowNumber, cells }`, blank rows already dropped. */
	rows: { student: ExportedStudent; index: number; cells: Record<string, string> }[];
}

/**
 * A tab name that Excel will actually accept AND that no other sheet has.
 *
 * `sheetName` handles the format's own rules (31 characters, no `[]:*?/\`); the
 * suffix handles two modules with the same title, which is ordinary -- an
 * assignment with "Bill of materials" in two units has it twice. The base is
 * re-truncated to make room for the suffix rather than appended past the cap,
 * because a name over 31 characters is a workbook that does not open.
 */
function uniqueSheetName(base: string, taken: Set<string>): string {
	const first = sheetName(base);
	if (!taken.has(first)) {
		taken.add(first);
		return first;
	}
	for (let n = 2; n < 100; n++) {
		const suffix = ` ${n}`;
		const candidate = sheetName(first.slice(0, 31 - suffix.length) + suffix);
		if (!taken.has(candidate)) {
			taken.add(candidate);
			return candidate;
		}
	}
	// Unreachable with fewer than a hundred collisions, and a thrown error here
	// would lose the whole export over a tab name.
	const fallback = sheetName(`Table ${taken.size + 1}`);
	taken.add(fallback);
	return fallback;
}

/**
 * EVERY TABLE BLOCK IN THE EXPORT, WITH ITS BLANK ROWS ALREADY GONE.
 *
 * Gathered from the students' own `responses`, not from the spec, so the table
 * sheets and the Responses sheet are reading the same list and cannot come to
 * disagree about which blocks exist. A block appears once even though every
 * student carries it, and the column list is taken from the first student who
 * has it, which is the spec's own list.
 *
 * THE BLANK-ROW RULE IS `tableRowFilled` AND NOTHING ELSE. A row where every
 * cell is blank is a row the student left, and it is dropped; a row with any
 * cell filled is real and stays whole. That is the SAME predicate
 * `blockProgress` counts a table's progress with, so a table reporting "3 of 4
 * rows" cannot then export four.
 */
function tableBlocksOf(students: ExportedStudent[]): {
	blocks: TableBlockSheet[];
	dropped: number;
} {
	const byId = new Map<string, TableBlockSheet>();
	let dropped = 0;
	for (const student of students) {
		for (const entry of student.responses) {
			if (entry.blockType !== 'table') continue;
			let block = byId.get(entry.blockId);
			if (!block) {
				block = {
					blockId: entry.blockId,
					label: entry.moduleTitle?.trim() || entry.blockId,
					columns: (entry.value.columns ?? []) as { key: string; label: string }[],
					sheet: '',
					rows: []
				};
				byId.set(entry.blockId, block);
			}
			const rows = (entry.value.rows ?? []) as Record<string, string>[];
			let kept = 0;
			for (const row of rows) {
				if (!tableRowFilled(row)) {
					dropped += 1;
					continue;
				}
				kept += 1;
				block.rows.push({ student, index: kept, cells: row });
			}
		}
	}
	return { blocks: [...byId.values()], dropped };
}

/**
 * A column wide enough for what is actually in it, within reason.
 *
 * Chosen from the content rather than pinned, because these columns are the
 * student's own and nothing here knows in advance whether one holds "3" or a
 * paragraph about material selection. The floor keeps a header readable and the
 * ceiling is what stops one long cell pushing every other column off screen;
 * past it the text wraps, which is what the wrap style and the row-height cap
 * are for.
 */
function fittedWidth(header: string, values: string[]): number {
	const longest = values.reduce((n, v) => Math.max(n, ...v.split('\n').map((l) => l.length)), header.length);
	return Math.min(44, Math.max(12, longest + 2));
}

/** A stored answer as one cell of text. A TABLE is a pointer, never a dump. */
function answerCell(entry: ExportedResponse, tableSheetFor: Map<string, string>): string {
	const v = entry.value;
	if (entry.blockType === 'textField') return String(v.text ?? '');
	if (entry.blockType === 'declaration') return yesNo(v.checked === true);
	if (entry.blockType === 'checklist') {
		const items = (v.items ?? []) as { label: string; checked: boolean }[];
		return items.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.label}`).join('\n');
	}
	if (entry.blockType === 'imageZone') {
		const files = (v.files ?? []) as { filename: string; caption: string | null }[];
		return files.map((f) => (f.caption ? `${f.filename} (${f.caption})` : f.filename)).join('\n');
	}
	// A TABLE. This used to flatten the whole thing into this one cell, column
	// labels and values joined by pipes and rows joined by newlines -- which is
	// unreadable, unsortable, unfilterable, and made the row tall enough to fill
	// a screen. The rows are real rows on their own sheet now, and this says
	// where, so nothing is lost by looking in the wrong place.
	const rows = ((v.rows ?? []) as Record<string, string>[]).filter(tableRowFilled);
	if (!rows.length) return 'No rows filled in.';
	const where = tableSheetFor.get(entry.blockId);
	const count = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
	return where ? `${count}, in the "${where}" sheet.` : count;
}

export function gradingExportSheets(payload: GradingExport): XlsxSheet[] {
	const named = payload.export.identity === 'included';
	const assignment = payload.assignments[0];
	const rubric = assignment?.rubric ?? [];
	const students = assignment?.students ?? [];

	// ONE COLUMN PAIR PER CRITERION -- the score and the level it landed on --
	// because a grader scanning a class wants to see WHICH level was chosen, and
	// a number on its own does not say that once a rubric has been edited.
	const critHeaders = rubric.flatMap((c) => [`${c.criterion} (/${criterionMax(c)})`, `${c.criterion}: level`]);
	const critWidths = rubric.flatMap(() => [12, 22]);

	/**
	 * THE EXTRA-CREDIT PAIR IS CONDITIONAL AND THE CHANGE PAIR IS NOT, AND THAT
	 * IS A DISTINCTION RATHER THAN AN INCONSISTENCY.
	 *
	 * "Did this work change after it was graded" is asked of EVERY graded row
	 * and a blank cell is a real answer to it, so the columns are always there.
	 * Extra credit is an award most classes never make: a permanently blank
	 * column is noise in a gradebook, and its absence cannot be misread, because
	 * `Score` already carries whatever was awarded. It also keeps the feature
	 * genuinely INERT when unused -- an export of a class with no extra credit
	 * is byte-identical to the same export with the field ignored entirely.
	 */
	const anyExtraCredit = students.some((s) => (s.submission.extraCredit ?? 0) !== 0);
	const ecHeaders = anyExtraCredit ? ['Extra credit'] : [];
	const ecWidths = anyExtraCredit ? [12] : [];

	const idHeaders = named ? ['Last', 'First', 'Email'] : [];
	const idWidths = named ? [16, 14, 28] : [];
	/** The identity columns every per student sheet leads with. */
	const who = (s: ExportedStudent) => (named ? [s.label, s.name] : [s.label]);
	const whoHeader = named ? ['Student', 'Name'] : ['Student'];
	const whoWidths = named ? [12, 20] : [12];

	const { blocks, dropped } = tableBlocksOf(students);
	const perSheet = blocks.length > 0 && blocks.length <= MAX_TABLE_SHEETS;
	const taken = new Set(RESERVED_SHEETS);
	if (perSheet) for (const b of blocks) b.sheet = uniqueSheetName(b.label, taken);
	const tableSheetFor = new Map(
		blocks.map((b) => [b.blockId, perSheet ? b.sheet : 'Table rows'] as const)
	);

	const grades: XlsxSheet = {
		name: 'Grades',
		maxRowHeight: MAX_ROW_HEIGHT_PT,
		header: [
			'Student',
			...idHeaders,
			'State',
			'Handed in',
			'Complete',
			'Unmet checks',
			'Score',
			...ecHeaders,
			'Out of',
			'Percent',
			'Submitted',
			'Returned',
			'Changed after grading',
			'Changed at',
			'Private comment',
			...critHeaders
		],
		widths: [12, ...idWidths, 12, 11, 10, 13, 8, ...ecWidths, 8, 9, 20, 20, 24, 20, 40, ...critWidths],
		rows: students.map((s) => {
			const { last, first } = named
				? splitLastFirst(s.name ?? '', s.email ?? '')
				: { last: '', first: '' };
			const pct =
				s.submission.score != null && s.submission.outOf > 0
					? Math.round((s.submission.score / s.submission.outOf) * 1000) / 10
					: null;
			return [
				s.label,
				...(named ? [last, first, s.email] : []),
				s.submission.stateLabel,
				yesNo(s.submission.handedIn),
				s.completeness.evaluated ? (s.submission.handedIn ? yesNo(s.completeness.complete) : '') : 'No spec',
				s.completeness.unmetCount,
				s.submission.score,
				...(anyExtraCredit ? [s.submission.extraCredit] : []),
				s.submission.outOf,
				pct,
				s.submission.submittedAt,
				s.submission.returnedAt,
				// The words come from `postGradeChangeLabel`, the SAME function the
				// console's chip reads, so a spreadsheet and a screen cannot end up
				// describing one fact differently.
				s.submission.changedAfterGrading
					? postGradeChangeLabel(s.submission.changedAfterGrading)
					: '',
				s.submission.changedAfterGrading?.at ?? '',
				s.privateComment,
				...rubric.flatMap((c) => {
					const found = s.scores.find((x) => x.criterionId === c.id);
					const level = found?.override
						? `Override${found.comment ? `: ${found.comment}` : ''}`
						: (found?.level?.label ?? '');
					return [found?.score ?? null, level];
				})
			];
		})
	};

	const unmet: XlsxSheet = {
		name: 'Unmet checks',
		maxRowHeight: MAX_ROW_HEIGHT_PT,
		header: [...whoHeader, 'Module', 'Block', 'Kind', 'Need', 'Have', 'Requirement'],
		widths: [...whoWidths, 14, 12, 12, 7, 7, 70],
		rows: students.flatMap((s) =>
			s.completeness.unmet.map((u) => [
				...who(s),
				u.moduleId,
				u.blockId,
				u.kind,
				u.need,
				u.have,
				u.requirement
			])
		)
	};

	const responses: XlsxSheet = {
		name: 'Responses',
		maxRowHeight: MAX_ROW_HEIGHT_PT,
		header: [...whoHeader, 'Module', 'Block', 'Type', 'Prompt', 'Started', 'Answer'],
		widths: [...whoWidths, 18, 10, 12, 40, 9, 70],
		rows: students.flatMap((s) =>
			s.responses.map((r) => [
				...who(s),
				r.moduleTitle,
				r.blockId,
				r.blockType,
				r.prompt,
				yesNo(r.started),
				answerCell(r, tableSheetFor)
			])
		)
	};

	// A SHEET PER TABLE BLOCK: real rows, real columns, one row per table row,
	// led by the same identity columns every other sheet leads with so a filter
	// on one student works the same way everywhere.
	const tableSheets: XlsxSheet[] = perSheet
		? blocks.map((b) => {
				const cells = b.rows.map((r) => r.cells);
				return {
					name: b.sheet,
					maxRowHeight: MAX_ROW_HEIGHT_PT,
					header: [...whoHeader, 'Row', ...b.columns.map((c) => c.label)],
					widths: [
						...whoWidths,
						6,
						...b.columns.map((c) =>
							fittedWidth(c.label, cells.map((r) => String(r[c.key] ?? '')))
						)
					],
					rows: b.rows.map((r) => [
						...who(r.student),
						r.index,
						...b.columns.map((c) => String(r.cells[c.key] ?? ''))
					])
				};
			})
		: blocks.length
			? [
					{
						name: 'Table rows',
						maxRowHeight: MAX_ROW_HEIGHT_PT,
						header: [...whoHeader, 'Block', 'Table', 'Row', 'Column', 'Value'],
						widths: [...whoWidths, 12, 22, 6, 24, 60],
						rows: blocks.flatMap((b) =>
							b.rows.flatMap((r) =>
								b.columns.map((c) => [
									...who(r.student),
									b.blockId,
									b.label,
									r.index,
									c.label,
									String(r.cells[c.key] ?? '')
								])
							)
						)
					}
				]
			: [];

	const files: XlsxSheet = {
		name: 'Files',
		maxRowHeight: MAX_ROW_HEIGHT_PT,
		header: [...whoHeader, 'Block', 'Filename', 'Caption'],
		widths: [...whoWidths, 12, 36, 36],
		rows: students.flatMap((s) =>
			s.files.map((f) => [...who(s), f.blockId, f.filename, f.caption])
		)
	};

	// THE ABOUT SHEET IS NOT DECORATION. A workbook gets forwarded without the
	// message it arrived in, so what it is, which class it came from and
	// whether it carries names have to be readable from inside it. The two
	// table lines are here for the same reason: a reader should not have to
	// infer the shape from the tab bar, and a dropped row is a change to the
	// data that has to be stated rather than done quietly.
	const about: XlsxSheet = {
		name: 'About this export',
		maxRowHeight: MAX_ROW_HEIGHT_PT,
		header: ['Field', 'Value'],
		widths: [26, 100],
		rows: [
			['What this is', payload.export.what],
			['Identity', payload.export.identity === 'included' ? 'Names included' : 'Names omitted'],
			['Identity note', payload.export.identityNote],
			['Section', payload.section.title],
			['Assignment', assignment?.title ?? ''],
			['Assignment id', assignment?.itemId ?? ''],
			['Due', assignment?.dueAt ?? ''],
			['Out of', assignment?.outOf ?? ''],
			['Students in this file', payload.export.counts.students],
			['Table blocks', blocks.length],
			[
				'Table layout',
				blocks.length === 0
					? 'This assignment has no table blocks.'
					: perSheet
						? 'One sheet per table block, with that table\u2019s own columns as real columns.'
						: `More than ${MAX_TABLE_SHEETS} table blocks, so every table is on the single "Table rows" sheet, one row per cell.`
			],
			[
				'Blank table rows dropped',
				`${dropped} (a row where every cell was blank is a row the student left, not data; a row with any cell filled is kept whole)`
			],
			['Generated at', payload.export.generatedAt],
			['Source', payload.export.source],
			[
				'Not in this workbook',
				'The full assignment spec and rubric as stored. Those are in the JSON export beside this one, which is the file to hand a language model.'
			]
		]
	};

	return [grades, unmet, responses, ...tableSheets, files, about];
}

/** `graded-<assignment>-<section>-<scope>[-anon].<ext>`, filesystem-safe. */
export function gradingExportFilename(payload: GradingExport, ext: 'json' | 'xlsx'): string {
	const slug = (raw: string) =>
		raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
	const scope =
		payload.export.scope === 'student'
			? slug(payload.assignments[0]?.students[0]?.label ?? 'student')
			: 'class';
	const anon = payload.export.identity === 'omitted' ? '-anon' : '';
	return `graded-${slug(payload.assignments[0]?.title ?? 'assignment')}-${slug(payload.section.title)}-${scope}${anon}.${ext}`;
}
