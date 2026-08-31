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
import type { XlsxSheet } from '$lib/xlsx';

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
			outOf
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

/** A stored answer as one cell of text. Tables and checklists are flattened. */
function answerCell(entry: ExportedResponse): string {
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
	// table
	const cols = (v.columns ?? []) as { key: string; label: string }[];
	const rows = (v.rows ?? []) as Record<string, string>[];
	return rows
		.map((r) => cols.map((c) => `${c.label}: ${String(r[c.key] ?? '').trim()}`).join(' | '))
		.join('\n');
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

	const idHeaders = named ? ['Last', 'First', 'Email'] : [];
	const idWidths = named ? [16, 14, 28] : [];

	const grades: XlsxSheet = {
		name: 'Grades',
		header: [
			'Student',
			...idHeaders,
			'State',
			'Handed in',
			'Complete',
			'Unmet checks',
			'Score',
			'Out of',
			'Percent',
			'Submitted',
			'Returned',
			'Private comment',
			...critHeaders
		],
		widths: [12, ...idWidths, 12, 11, 10, 13, 8, 8, 9, 20, 20, 40, ...critWidths],
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
				s.submission.outOf,
				pct,
				s.submission.submittedAt,
				s.submission.returnedAt,
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
		header: ['Student', ...(named ? ['Name'] : []), 'Module', 'Block', 'Kind', 'Need', 'Have', 'Requirement'],
		widths: [12, ...(named ? [20] : []), 14, 12, 12, 7, 7, 70],
		rows: students.flatMap((s) =>
			s.completeness.unmet.map((u) => [
				s.label,
				...(named ? [s.name] : []),
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
		header: [
			'Student',
			...(named ? ['Name'] : []),
			'Module',
			'Block',
			'Type',
			'Prompt',
			'Started',
			'Answer'
		],
		widths: [12, ...(named ? [20] : []), 18, 10, 12, 40, 9, 70],
		rows: students.flatMap((s) =>
			s.responses.map((r) => [
				s.label,
				...(named ? [s.name] : []),
				r.moduleTitle,
				r.blockId,
				r.blockType,
				r.prompt,
				yesNo(r.started),
				answerCell(r)
			])
		)
	};

	const files: XlsxSheet = {
		name: 'Files',
		header: ['Student', ...(named ? ['Name'] : []), 'Block', 'Filename', 'Caption'],
		widths: [12, ...(named ? [20] : []), 12, 36, 36],
		rows: students.flatMap((s) =>
			s.files.map((f) => [s.label, ...(named ? [s.name] : []), f.blockId, f.filename, f.caption])
		)
	};

	// THE ABOUT SHEET IS NOT DECORATION. A workbook gets forwarded without the
	// message it arrived in, so what it is, which class it came from and
	// whether it carries names have to be readable from inside it.
	const about: XlsxSheet = {
		name: 'About this export',
		header: ['Field', 'Value'],
		widths: [22, 100],
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
			['Generated at', payload.export.generatedAt],
			['Source', payload.export.source],
			[
				'Not in this workbook',
				'The full assignment spec and rubric as stored. Those are in the JSON export beside this one, which is the file to hand a language model.'
			]
		]
	};

	return [grades, unmet, responses, files, about];
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
