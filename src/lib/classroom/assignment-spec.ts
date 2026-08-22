/**
 * The assignment engine's client-safe pure layer (the curriculum.ts
 * convention): spec types + validation, the preflight derivation, sentence
 * counting, rubric generation, grading math, and the FACTS CSV. No Svelte, no
 * Supabase.
 *
 * THE SPEC FORMAT is docs/standards/IDEA_MATERIAL_SPEC_v2.md, a copy of a
 * document authored and maintained OUTSIDE this repo, one JSON document per
 * assignment. Validation here is the FRIENDLY half -- the import UI runs it so
 * a teacher sees every problem at once before anything is sent. The BOUNDARY is
 * _classroom_check_spec in migration 0086, which enforces the same rules inside
 * the SECURITY DEFINER RPC; this module and that function must agree, and the
 * suite pins the server side.
 *
 * THE SENTENCE RULE (countSentences) is mirrored by _classroom_sentence_count
 * (re-defined in 0112): before splitting on runs of . ! ? , protect periods
 * that are not real sentence ends -- decimal points, ellipses, and common
 * abbreviations -- then count the pieces containing a letter or digit. Change
 * both together or the live counter will disagree with the server's submit
 * preflight.
 */

// ---------------------------------------------------------------------------
// Spec types (IDEA_MATERIAL_SPEC_v2.md Part 1, schema v1 -- the `kind` default)
// ---------------------------------------------------------------------------

export interface SpecMeta {
	assignmentId: string;
	course?: string;
	unit?: number | string;
	title: string;
	buildVersion?: string;
	totalPoints: number;
	dueDate?: string;
	theme?: string;
	gradingCategory?: string;
	headerFields?: string[];
}

export interface InstructionsBlock {
	type: 'instructions';
	content: string;
}

export interface TextFieldBlock {
	type: 'textField';
	id: string;
	prompt: string;
	minSentences?: number;
	maxSentences?: number;
	points?: number;
}

export interface TableColumn {
	key: string;
	label: string;
	tip?: string;
}

export interface TableBlock {
	type: 'table';
	id: string;
	points?: number;
	columns: TableColumn[];
	minRows?: number;
	printRows?: number;
	rowImages?: boolean;
	statusColumn?: boolean;
}

export interface ImageZoneBlock {
	type: 'imageZone';
	id: string;
	minImages?: number;
	captions?: boolean;
	points?: number;
}

export interface ChecklistBlock {
	type: 'checklist';
	id: string;
	points?: number;
	items: string[];
}

/**
 * `printAs` AND `printConfig` USED TO BE DECLARED HERE AND ON `ImageZoneBlock`,
 * and are gone. They described a dual engine-and-print rendering contract from
 * schema v1.0 that this repo never implemented: there is no separate print
 * renderer for spec blocks and there never was one. Print is `@media print` CSS
 * inside the components that render the blocks -- SpecRenderer, ReferenceBlock,
 * MarkdownText, GradeCalculator, InfoTip -- and nothing anywhere read either
 * field. IDEA_MATERIAL_SPEC v2.2 records both facts and says to treat them as
 * dead until removed.
 *
 * REMOVING THEM BREAKS NO STORED SPEC, which is why it is safe rather than
 * merely tidy. Neither validator rejects unknown keys on a block: `validateSpec`
 * below and `_classroom_check_spec` (0086) each check `type` against a whitelist
 * and then validate the fields they name. A spec still carrying `printAs`
 * therefore imports and renders exactly as it did; the field is simply no longer
 * a thing the type system claims this app understands.
 */
export interface CalcBlock {
	type: 'calc';
	id: string;
	tool?: string;
	config?: unknown;
}

export type SpecBlock =
	| InstructionsBlock
	| TextFieldBlock
	| TableBlock
	| ImageZoneBlock
	| ChecklistBlock
	| CalcBlock;

/** A block that stores something under its id (everything but instructions/calc). */
export type InteractiveBlock = TextFieldBlock | TableBlock | ImageZoneBlock | ChecklistBlock;

/**
 * One level of a spec rubric criterion (schema v1.1). `points` is required --
 * the top level's points ARE the criterion maximum, which is what v1.1 dropped
 * the flat `points` field in favour of.
 */
export interface SpecRubricLevel {
	points: number;
	label: string;
	descriptor: string;
	/**
	 * The descriptor in a line, for a control that has to show every level at
	 * once. Optional: a level authored before this existed has only the
	 * descriptor, and `levelShort` falls back to it.
	 */
	short?: string;
}

export interface SpecRubricRow {
	/** Authored id, used for the generated criterion id when present. */
	id?: string;
	criterion: string;
	levels: SpecRubricLevel[];
	/** v1.0's flat maximum. Accepted only when it agrees with the top level. */
	points?: number;
}

export interface SpecModule {
	id: string;
	title: string;
	points: number;
	aiLevel?: number | null;
	/**
	 * Schema v2's module-specific AI context
	 * (docs/standards/IDEA_MATERIAL_SPEC_v2.md): one or two sentences on what
	 * this level means for THIS module's actual work, surfaced on hover/focus
	 * of the AI badge in place of the generic level rule. Absent falls back to
	 * that generic rule (AI_LEVELS' blurb).
	 */
	aiNote?: string | null;
	intro?: string;
	blocks: SpecBlock[];
	rubric?: SpecRubricRow[];
	customChecks?: { name?: string; description?: string }[];
}

export interface AssignmentSpec {
	schemaVersion: 1;
	/**
	 * Schema v2's discriminator. ABSENT MEANS ASSIGNMENT: every pre-v2 spec file
	 * has no `kind` at all, so the default is what keeps them valid and
	 * unchanged. See reference-spec.ts's `specKind`, which owns that rule, and
	 * _classroom_check_spec (0092), which applies it identically in SQL.
	 */
	kind?: 'assignment';
	meta: SpecMeta;
	modules: SpecModule[];
	declarations?: { academicIntegrity?: boolean };
	approvalGate?: { afterModule: string; label?: string } | null;
	print?: Record<string, unknown>;
}

/** The reserved response key the declaration checkbox saves under. Block ids
 *  are validated to [A-Za-z0-9_-], so this can never collide with one. */
export const DECLARATION_BLOCK_ID = '@declaration';

/** The standard declaration text: lives with the renderer, never per-spec. */
export const DECLARATION_TEXT =
	'This work is my own. Any AI use follows this assignment’s AI level, and I can explain every part of what I am submitting.';

/** AI-level badges per IDEA_AI_Use_Policy.md. */
export const AI_LEVELS: Record<number, { label: string; blurb: string }> = {
	0: { label: 'AI OFF', blurb: 'No AI use on this module.' },
	1: { label: 'AI COACH', blurb: 'AI may explain and quiz you; it may not produce your work.' },
	2: { label: 'AI ASSIST', blurb: 'AI may help draft; you must revise, verify, and disclose.' },
	3: { label: 'AI OPEN', blurb: 'AI use is open; disclose what you used.' }
};

// ---------------------------------------------------------------------------
// Engine row types (mirroring 0086's tables)
// ---------------------------------------------------------------------------

export type SubmissionState = 'draft' | 'submitted' | 'returned';

export interface SubmissionRow {
	id: string;
	item_id: string;
	student_email: string;
	state: SubmissionState;
	submitted_at: string | null;
	returned_at: string | null;
	rubric_scores: Record<string, number> | null;
	/** {criterionId: comment}: required on an override, optional otherwise. */
	criterion_comments: Record<string, string> | null;
	score: number | null;
	teacher_comment: string | null;
	graded_by: string | null;
	graded_at: string | null;
	updated_at?: string;
}

export interface ResponseRow {
	item_id: string;
	student_email: string;
	block_id: string;
	value: ResponseValue;
	updated_at?: string;
}

export interface SubmissionFileRow {
	id: string;
	submission_id: string;
	block_id: string | null;
	caption: string | null;
	filename: string;
	mime_type: string;
	size_bytes?: number | null;
	sort_order?: number;
}

export interface ModuleApprovalRow {
	item_id: string;
	student_email: string;
	module_id: string;
	approved_by?: string;
	approved_at?: string;
}

/** What a block's response row holds, by block type. */
export type ResponseValue = {
	text?: string;
	rows?: Record<string, string>[];
	checked?: boolean[];
};

/**
 * A LEVELED rubric criterion (migration 0095). The grader picks a level rather
 * than typing a number, which is what makes three sections taught by two
 * instructors grade the same work the same way.
 *
 * THE CONSTRAINTS, enforced by _classroom_check_levels in SQL and mirrored here
 * by criterionIssues: three or four levels, the top level worth the criterion
 * maximum, the bottom level 0, points strictly descending, every level carrying
 * a label and a descriptor.
 *
 * `incomplete` is SERVER-DERIVED (the normalizer stamps it and discards whatever
 * a client sent), so it is a flag to render, never one to author: a criterion
 * migrated from the flat format has only its top level until somebody writes the
 * rest, and this is what makes that visible instead of silent.
 */
export interface RubricLevel {
	points: number;
	label: string;
	descriptor?: string;
	/**
	 * The one-line form the grading console's level control shows. Carried
	 * through from the spec by `rubricFromSpec` and stored verbatim (the
	 * normalizer passes `levels` through untouched), but almost every level
	 * already in a row predates it -- so nothing may depend on its presence.
	 * `levelShort` is the ONE resolver; there is no backfill and no second
	 * write path.
	 */
	short?: string;
}

export interface RubricCriterion {
	id: string;
	criterion: string;
	/** The maximum. Always equals levels[0].points; the server re-derives it. */
	points: number;
	levels: RubricLevel[];
	incomplete?: boolean;
}

/** Per-criterion grader comments: required on an override, keyed by criterion id. */
export type CriterionComments = Record<string, string>;

export const MIN_LEVELS = 3;
export const MAX_LEVELS = 4;

/** A criterion's maximum is its top level, always. */
export function criterionMax(c: { points?: number; levels?: RubricLevel[] }): number {
	const top = c.levels?.[0]?.points;
	return typeof top === 'number' ? top : (c.points ?? 0);
}

/**
 * Which level a score lands on, or -1 for an OVERRIDE. Derived from the number
 * alone (points are strictly descending, so at most one level can match), which
 * is exactly how classroom_grade_submission decides -- there is no stored level
 * index to drift out of step with an edited rubric.
 */
export function levelIndexForScore(
	c: Pick<RubricCriterion, 'levels'>,
	score: number | null | undefined
): number {
	if (score == null || Number.isNaN(Number(score))) return -1;
	return (c.levels ?? []).findIndex((l) => Number(l.points) === Number(score));
}

export function isOverrideScore(
	c: Pick<RubricCriterion, 'levels'>,
	score: number | null | undefined
): boolean {
	return score != null && !Number.isNaN(Number(score)) && levelIndexForScore(c, score) < 0;
}

/**
 * The level constraints as a list of plain-language problems -- empty means the
 * criterion is COMPLETE. The friendly half of _classroom_check_levels; the SQL
 * is the boundary, and the two must agree.
 */
export function criterionIssues(c: RubricCriterion): string[] {
	const issues: string[] = [];
	const levels = c.levels ?? [];
	if (levels.length < MIN_LEVELS || levels.length > MAX_LEVELS) {
		issues.push(`Needs ${MIN_LEVELS} or ${MAX_LEVELS} levels (it has ${levels.length}).`);
	}
	const max = criterionMax(c);
	levels.forEach((l, i) => {
		if (typeof l.points !== 'number' || Number.isNaN(l.points)) {
			issues.push(`Level ${i + 1} needs a point value.`);
		}
		if (!l.label?.trim()) issues.push(`Level ${i + 1} needs a label.`);
		if (!l.descriptor?.trim()) issues.push(`Level ${i + 1} needs a descriptor.`);
		if (i > 0 && Number(l.points) >= Number(levels[i - 1].points)) {
			issues.push(`Level ${i + 1} must be worth less than the level above it.`);
		}
	});
	if (levels.length && Number(levels[levels.length - 1].points) !== 0) {
		issues.push('The bottom level must be worth 0.');
	}
	if (levels.length && Number(levels[0].points) !== max) {
		issues.push('The top level must equal the criterion maximum.');
	}
	return issues;
}

/** Server-stamped when present; otherwise recomputed, so an unsaved edit reads right. */
export function criterionIncomplete(c: RubricCriterion): boolean {
	return c.incomplete ?? criterionIssues(c).length > 0;
}

// ---------------------------------------------------------------------------
// Sentence counting (mirrors _classroom_sentence_count exactly)
// ---------------------------------------------------------------------------

// A comma-separated period is real, but these never end a sentence. Keep in
// sync with the alternation in _classroom_sentence_count.
const SENTENCE_ABBREVIATIONS =
	'mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|fig|vol|ed|eds|al';
const ABBREV_RE = new RegExp(`\\b(${SENTENCE_ABBREVIATIONS})\\.`, 'gi');

/** \x01 marks a period that is NOT a sentence break, cleared before splitting. */
export function countSentences(text: string | null | undefined): number {
	let s = text ?? '';
	// An ellipsis is a pause, not a full stop -- collapse any run of 2+ dots.
	s = s.replace(/\.{2,}/g, '\x01');
	// A period between two digits is a decimal point (3.5, 3.3.3.3), never a
	// sentence end.
	s = s.replace(/(\d)\.(?=\d)/g, '$1\x01');
	// "e.g." and "i.e." carry an internal period too -- collapse the whole
	// token before the generic abbreviation pass, or that inner period would
	// still read as a break.
	s = s.replace(/\be\.g\./gi, 'eg\x01');
	s = s.replace(/\bi\.e\./gi, 'ie\x01');
	// Common titles and abbreviations never end a sentence either.
	s = s.replace(ABBREV_RE, '$1\x01');
	return s.split(/[.!?]+/).filter((piece) => /[A-Za-z0-9]/.test(piece)).length;
}

export type SentenceState = 'empty' | 'below' | 'met';

/** The counter's three visual states: dim empty, amber below min, green at min. */
export function sentenceState(count: number, min: number | undefined): SentenceState {
	if (count === 0) return 'empty';
	if ((min ?? 0) > 0 && count < (min as number)) return 'below';
	return 'met';
}

// ---------------------------------------------------------------------------
// Spec validation (the friendly half; _classroom_check_spec is the boundary)
// ---------------------------------------------------------------------------

import { countWords } from '$lib/rich-text';
import { parseMarkdown, type InlineRun, type MarkdownList } from './reference-spec';
import { specKind } from './reference-spec';

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

// ---------------------------------------------------------------------------
// The instructions budget (IDEA_MATERIAL_SPEC v2.1, modules[])
// ---------------------------------------------------------------------------

/**
 * 250 IS THE TARGET, 300 IS THE CEILING, and the gap is deliberate: one
 * unavoidably long procedure should not require a standards argument, and a
 * ceiling that authors write to stops being a ceiling.
 *
 * The reason the budget exists at all is the item page's single scroll column:
 * instructions and the input tables share it, so every paragraph of teaching
 * pushes the working surface further down. Procedure a student needs at the
 * bench stays in the item; teaching that explains why belongs in the unit
 * reference document.
 *
 * WHERE EACH NUMBER IS ENFORCED, and they are different jobs. 301 is the
 * REPO's job -- `tests/spec-instructions-budget.test.ts` sweeps every spec
 * under `materials/` and fails by name and by count, which is what makes the
 * ceiling a constraint rather than a preference. 251 through 300 is the
 * IMPORTER's job: a WARNING in the same problem list every other problem
 * appears in, which never gates publish, because a spec over target is over
 * target and not wrong.
 */
export const INSTRUCTIONS_WORD_TARGET = 250;
export const INSTRUCTIONS_WORD_CEILING = 300;

/**
 * The runs of ONE paragraph, cell or list item, counted as one string.
 *
 * JOINED WITH NOTHING, and that is the load-bearing part. A run boundary is a
 * FORMATTING boundary, not a word boundary: `**Measure**.` arrives as a bold
 * run and a `.` run, and counting the runs separately charges the author two
 * words for one. Joining before counting is also why this must never be used
 * ACROSS a structural boundary -- two list items joined would read as one word
 * where the marker was, which is the mistake the notebook normalizer made with
 * real content.
 */
function runWords(runs: InlineRun[]): number {
	return countWords(runs.map((run) => run.text).join(''));
}

function listWords(list: MarkdownList): number {
	let n = 0;
	for (const item of list.items) {
		n += runWords(item.runs);
		if (item.child) n += listWords(item.child);
	}
	return n;
}

/**
 * Words of RENDERED instructions content in one module, markdown syntax
 * excluded, summed across every `instructions` block the module carries.
 *
 * IT COUNTS WHAT MarkdownText WILL DRAW, by walking the same `parseMarkdown`
 * output that component walks -- not by running a regex over the source. A
 * hand-rolled syntax stripper is a second, worse implementation of the parser:
 * it would charge an author for their pipe-table borders and their list
 * markers, and the number a test failed on would not be the number on the
 * page. A figure's alt text IS counted, because it renders as the visible
 * caption; a code block is counted because it renders.
 */
export function instructionsWordCount(mod: SpecModule): number {
	let total = 0;
	for (const block of mod.blocks) {
		if (block.type !== 'instructions') continue;
		for (const node of parseMarkdown(block.content ?? '')) {
			if (node.type === 'heading' || node.type === 'paragraph') total += runWords(node.runs);
			else if (node.type === 'list') total += listWords(node);
			else if (node.type === 'quote') for (const p of node.paragraphs) total += runWords(p);
			else if (node.type === 'code') total += countWords(node.text);
			else if (node.type === 'table') {
				for (const cell of node.headers) total += runWords(cell);
				for (const row of node.rows) for (const cell of row) total += runWords(cell);
			} else if (node.type === 'figure') total += countWords(node.alt);
		}
	}
	return total;
}

/**
 * THE FRIENDLY HALF OF SPEC VALIDATION, in two tiers.
 *
 * `errors` are refusals: the spec comes back null and nothing can be
 * published. `warnings` are advice the importer renders in the same problem
 * list, visually distinct, and NEVER a gate -- a spec over the instructions
 * target is over target, not wrong, and a teacher with a reason for a long
 * procedure must not be stopped by an authoring preference. Anything that
 * genuinely may not ship is an error here and a refusal in
 * `_classroom_check_spec` (0086), which is the actual boundary.
 */
export function validateSpec(raw: unknown): {
	spec: AssignmentSpec | null;
	errors: string[];
	warnings: string[];
} {
	const errors: string[] = [];
	const warnings: string[] = [];
	const fail = () => ({ spec: null, errors, warnings });

	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		errors.push('The spec must be a JSON object.');
		return fail();
	}
	const spec = raw as Record<string, unknown>;
	// The v2 discriminator, checked FIRST so a reference document pasted into
	// the assignment importer says what it actually is instead of drowning in
	// "needs a modules array". An absent `kind` is an assignment (see the type).
	const kind = specKind(raw);
	if (kind === 'reference') {
		errors.push(
			'That is a reference document (kind: "reference"). Attach it to a Material, not an assignment.'
		);
		return fail();
	}
	if (kind === null) {
		errors.push('kind must be "assignment" or "reference" when present.');
		return fail();
	}
	if (spec.schemaVersion !== 1) {
		errors.push('Unsupported schemaVersion (this engine reads schema v1).');
	}

	const meta = spec.meta as Record<string, unknown> | undefined;
	if (typeof meta !== 'object' || meta === null) {
		errors.push('The spec needs a meta object.');
		return fail();
	}
	if (!String(meta.assignmentId ?? '').trim()) errors.push('meta.assignmentId is required.');
	if (!String(meta.title ?? '').trim()) errors.push('meta.title is required.');
	if (typeof meta.totalPoints !== 'number' || meta.totalPoints < 0 || meta.totalPoints > 10000) {
		errors.push('meta.totalPoints must be a number between 0 and 10000.');
	}

	const modules = spec.modules;
	if (!Array.isArray(modules) || modules.length === 0) {
		errors.push('The spec needs a non-empty modules array.');
		return fail();
	}
	if (modules.length > 40) errors.push('At most 40 modules per spec.');

	const moduleIds = new Set<string>();
	const blockIds = new Set<string>();
	const calcIds: string[] = [];
	let pointsSum = 0;

	modules.forEach((m, mi) => {
		const mod = m as Record<string, unknown>;
		const label = `Module ${mi + 1}`;
		const id = String(mod.id ?? '');
		if (!ID_RE.test(id)) {
			errors.push(`${label} needs an id (letters, digits, - and _ only).`);
		} else if (moduleIds.has(id)) {
			errors.push(`Duplicate module id "${id}".`);
		} else {
			moduleIds.add(id);
		}
		const name = id || label;
		if (!String(mod.title ?? '').trim()) errors.push(`Module "${name}" needs a title.`);
		if (typeof mod.points !== 'number' || mod.points < 0 || mod.points > 10000) {
			errors.push(`Module "${name}" needs a numeric points value (0-10000).`);
		} else {
			pointsSum += mod.points;
		}
		if (mod.aiLevel != null && ![0, 1, 2, 3].includes(mod.aiLevel as number)) {
			errors.push(`Module "${name}" aiLevel must be 0-3 or null.`);
		}
		if (mod.aiNote != null && typeof mod.aiNote !== 'string') {
			errors.push(`Module "${name}" aiNote must be a string when present.`);
		}

		const blocks = mod.blocks;
		if (!Array.isArray(blocks)) {
			errors.push(`Module "${name}" needs a blocks array.`);
			return;
		}
		blocks.forEach((b, bi) => {
			const block = b as Record<string, unknown>;
			const type = String(block.type ?? '');
			const bLabel = `Module "${name}" block ${bi + 1}`;
			if (!['instructions', 'textField', 'table', 'imageZone', 'checklist', 'calc'].includes(type)) {
				errors.push(`${bLabel} has unknown type "${type || '(none)'}".`);
				return;
			}
			if (type === 'calc') {
				calcIds.push(String(block.id ?? '(unnamed)'));
				return;
			}
			if (type === 'instructions') {
				if (!String(block.content ?? '')) errors.push(`${bLabel} (instructions) has no content.`);
				return;
			}
			const bid = String(block.id ?? '');
			if (!ID_RE.test(bid)) {
				errors.push(`${bLabel} needs an id (letters, digits, - and _ only).`);
			} else if (blockIds.has(bid)) {
				errors.push(`Duplicate block id "${bid}".`);
			} else {
				blockIds.add(bid);
			}
			if (type === 'textField') {
				if (!String(block.prompt ?? '').trim()) errors.push(`textField "${bid}" needs a prompt.`);
				const min = block.minSentences;
				const max = block.maxSentences;
				if (min != null && (typeof min !== 'number' || min < 0)) {
					errors.push(`textField "${bid}" minSentences must be a number >= 0.`);
				}
				if (max != null && (typeof max !== 'number' || max < ((min as number) ?? 0))) {
					errors.push(`textField "${bid}" maxSentences must be a number >= minSentences.`);
				}
			} else if (type === 'table') {
				const columns = block.columns;
				if (!Array.isArray(columns) || columns.length === 0 || columns.length > 12) {
					errors.push(`table "${bid}" needs 1-12 columns.`);
				} else {
					const keys = new Set<string>();
					columns.forEach((c, ci) => {
						const col = c as Record<string, unknown>;
						const key = String(col.key ?? '');
						if (!ID_RE.test(key) || !String(col.label ?? '').trim()) {
							errors.push(`table "${bid}" column ${ci + 1} needs a key and a label.`);
						} else if (keys.has(key)) {
							errors.push(`table "${bid}" has a duplicate column key "${key}".`);
						} else {
							keys.add(key);
						}
					});
				}
				const minRows = block.minRows;
				if (minRows != null && (typeof minRows !== 'number' || minRows < 0 || minRows > 100)) {
					errors.push(`table "${bid}" minRows must be 0-100.`);
				}
			} else if (type === 'imageZone') {
				const min = block.minImages;
				if (min != null && (typeof min !== 'number' || min < 0 || min > 20)) {
					errors.push(`imageZone "${bid}" minImages must be 0-20.`);
				}
			} else if (type === 'checklist') {
				const items = block.items;
				if (
					!Array.isArray(items) ||
					items.length === 0 ||
					items.length > 30 ||
					items.some((it) => typeof it !== 'string' || !it.trim())
				) {
					errors.push(`checklist "${bid}" needs 1-30 non-empty text items.`);
				}
			}
		});

		// THE INSTRUCTIONS BUDGET, caught at import rather than at review.
		// Counted through the RENDERER's own parse (see instructionsWordCount)
		// and summed across every instructions block in the module, so the
		// number a teacher reads here is the number the repo's spec-lint test
		// reports. Over the CEILING is still a warning rather than an error:
		// the ceiling is enforced by that test, by name and by count, and the
		// tier that gates publishing is the one that answers to the SQL
		// boundary.
		const words = instructionsWordCount({ blocks: blocks as SpecBlock[] } as SpecModule);
		if (words > INSTRUCTIONS_WORD_CEILING) {
			warnings.push(
				`Module "${name}" instructions run to ${words} words, over the ${INSTRUCTIONS_WORD_CEILING}-word ceiling. Move the teaching into the unit reference document and keep the bench procedure here.`
			);
		} else if (words > INSTRUCTIONS_WORD_TARGET) {
			warnings.push(
				`Module "${name}" instructions run to ${words} words. The authoring target is ${INSTRUCTIONS_WORD_TARGET} and the ceiling is ${INSTRUCTIONS_WORD_CEILING}. This does not block publishing.`
			);
		}

		// Rubric criteria are LEVELED (schema v1.1). A criterion's maximum is its
		// TOP level's points, and a flat criterion is refused BY NAME -- the
		// message has to say which one, since a spec carries many.
		const rubric = mod.rubric;
		const modPoints = typeof mod.points === 'number' ? mod.points : 0;
		if (Array.isArray(rubric) && rubric.length > 0) {
			let sum = 0;
			// A criterion with no readable maximum contributes 0, which would make
			// the sum check fire as a second, misleading error on top of the real
			// one. (SQL never shows both -- it raises on the first problem.)
			let unreadable = false;
			rubric.forEach((r, ri) => {
				const row = r as Record<string, unknown>;
				const critName = String(row.criterion ?? '').trim();
				const where = `Module "${name}" rubric criterion ${critName ? `"${critName}"` : `${ri + 1}`}`;
				if (!critName) {
					errors.push(`Module "${name}" rubric row ${ri + 1} needs a criterion.`);
					unreadable = true;
					return;
				}
				const levels = row.levels;
				if (!Array.isArray(levels) || levels.length === 0) {
					errors.push(
						`${where} has no levels. Schema v1.1 requires leveled criteria: three or four levels, the top level worth the criterion maximum and the bottom level 0. Flat criteria are no longer valid.`
					);
					unreadable = true;
					return;
				}
				const top = (levels[0] as Record<string, unknown>)?.points;
				if (typeof top !== 'number' || top < 0 || top > 1000) {
					errors.push(`${where} level 1 needs a point value between 0 and 1000.`);
					unreadable = true;
					return;
				}
				if (row.points != null && Number(row.points) !== top) {
					errors.push(`${where} has points ${row.points} but its top level is worth ${top}.`);
				}
				const asCriterion: RubricCriterion = {
					id: String(row.id ?? `r${ri + 1}`),
					criterion: critName,
					points: top,
					levels: levels as RubricLevel[]
				};
				for (const issue of criterionIssues(asCriterion)) errors.push(`${where}: ${issue}`);
				sum += top;
			});
			if (!unreadable && sum !== modPoints) {
				errors.push(`Module "${name}" rubric sums to ${sum} but the module is worth ${modPoints} points.`);
			}
		} else if (modPoints > 0) {
			errors.push(`Module "${name}" carries ${modPoints} points but has no rubric.`);
		}
	});

	if (calcIds.length) {
		errors.push(
			`calc blocks are not supported yet (${calcIds.join(', ')}). The print rendering covers those materials until the calc engine lands.`
		);
	}
	if (typeof (spec.meta as SpecMeta)?.totalPoints === 'number' && pointsSum !== (spec.meta as SpecMeta).totalPoints) {
		errors.push(`Module points sum to ${pointsSum} but meta.totalPoints is ${(spec.meta as SpecMeta).totalPoints}.`);
	}

	const gate = spec.approvalGate as { afterModule?: string } | null | undefined;
	if (gate != null) {
		if (typeof gate !== 'object') {
			errors.push('approvalGate must be null or an object.');
		} else if (!moduleIds.has(String(gate.afterModule ?? ''))) {
			errors.push(`approvalGate.afterModule ("${gate.afterModule ?? ''}") is not a module id.`);
		}
	}

	return errors.length ? fail() : { spec: raw as AssignmentSpec, errors: [], warnings };
}

// ---------------------------------------------------------------------------
// Derived behavior: gate, completion, preflight
// ---------------------------------------------------------------------------

/** Module ids AFTER the approval gate, in module order (the locked set). */
export function gatedModuleIds(spec: AssignmentSpec): string[] {
	const after = spec.approvalGate?.afterModule;
	if (!after) return [];
	const index = spec.modules.findIndex((m) => m.id === after);
	if (index < 0) return [];
	return spec.modules.slice(index + 1).map((m) => m.id);
}

export function gateApproved(spec: AssignmentSpec, approvals: ModuleApprovalRow[]): boolean {
	const after = spec.approvalGate?.afterModule;
	if (!after) return true;
	return approvals.some((a) => a.module_id === after);
}

export interface UnmetEntry {
	module_id: string | null;
	block_id: string | null;
	kind: string;
	need: number;
	have: number;
}

/** How far along one block is against its own constraint. Null = no constraint. */
export function blockProgress(
	block: SpecBlock,
	responses: Map<string, ResponseValue>,
	filesByBlock: Map<string, number>
): { need: number; have: number } | null {
	if (block.type === 'textField') {
		const need = block.minSentences ?? 0;
		if (need <= 0) return null;
		return { need, have: countSentences(responses.get(block.id)?.text) };
	}
	if (block.type === 'table') {
		const need = block.minRows ?? 0;
		if (need <= 0) return null;
		const rows = responses.get(block.id)?.rows ?? [];
		const have = rows.filter(
			(r) => r && typeof r === 'object' && Object.values(r).some((v) => String(v ?? '').trim() !== '')
		).length;
		return { need, have };
	}
	if (block.type === 'imageZone') {
		// Absent minImages reads as "at least one" -- the zone exists to receive
		// photos. Mirrors _classroom_spec_unmet.
		const need = block.minImages ?? 1;
		if (need <= 0) return null;
		return { need, have: filesByBlock.get(block.id) ?? 0 };
	}
	if (block.type === 'checklist') {
		const checked = responses.get(block.id)?.checked ?? [];
		return { need: block.items.length, have: checked.filter(Boolean).length };
	}
	return null;
}

/**
 * The full preflight, mirroring _classroom_spec_unmet: what still stands
 * between this student and a valid submission. The server recomputes this at
 * submit; the client shows it live.
 */
export function specUnmet(
	spec: AssignmentSpec,
	responses: Map<string, ResponseValue>,
	filesByBlock: Map<string, number>,
	approvals: ModuleApprovalRow[]
): UnmetEntry[] {
	const unmet: UnmetEntry[] = [];
	const after = spec.approvalGate?.afterModule;
	const gateClosed = !!after && !approvals.some((a) => a.module_id === after);
	// A closed gate's entry stands in for everything behind it (mirrors
	// _classroom_spec_unmet): the student cannot act on a locked module, so its
	// constraints join the list only once the gate opens.
	const gated = gateClosed ? new Set(gatedModuleIds(spec)) : new Set<string>();
	if (gateClosed && after) {
		unmet.push({ module_id: after, block_id: null, kind: 'approval', need: 1, have: 0 });
	}
	for (const mod of spec.modules) {
		if (gated.has(mod.id)) continue;
		for (const block of mod.blocks) {
			const progress = blockProgress(block, responses, filesByBlock);
			if (progress && progress.have < progress.need) {
				unmet.push({
					module_id: mod.id,
					block_id: (block as InteractiveBlock).id,
					kind: block.type,
					need: progress.need,
					have: progress.have
				});
			}
		}
	}
	if (spec.declarations?.academicIntegrity) {
		const checked = responses.get(DECLARATION_BLOCK_ID)?.checked?.[0] === true;
		if (!checked) {
			unmet.push({
				module_id: null,
				block_id: DECLARATION_BLOCK_ID,
				kind: 'declaration',
				need: 1,
				have: 0
			});
		}
	}
	return unmet;
}

/**
 * HAS ANYTHING BEEN PUT INTO THIS BLOCK AT ALL.
 *
 * DELIBERATELY NOT `blockProgress(...).have > 0`, and the difference is the
 * whole point of the function. `blockProgress` answers "how far along is this
 * against its own constraint", so it returns null for a block that carries no
 * constraint -- a textField with no `minSentences`, a table with no `minRows`.
 * A student typing into one of those has unmistakably started work, and a
 * predicate built on progress would say they had not.
 *
 * ONE IMPLEMENTATION, because `moduleStarted` and `specStarted` below are the
 * same question asked at two altitudes and a second copy is how the two would
 * come to disagree.
 */
export function blockStarted(
	block: SpecBlock,
	responses: Map<string, ResponseValue>,
	filesByBlock: Map<string, number>
): boolean {
	if (block.type === 'textField') {
		return (responses.get(block.id)?.text ?? '').trim() !== '';
	}
	if (block.type === 'table') {
		const rows = responses.get(block.id)?.rows ?? [];
		return rows.some(
			(r) =>
				!!r &&
				typeof r === 'object' &&
				Object.values(r).some((v) => String(v ?? '').trim() !== '')
		);
	}
	if (block.type === 'imageZone') {
		return (filesByBlock.get(block.id) ?? 0) > 0;
	}
	if (block.type === 'checklist') {
		return (responses.get(block.id)?.checked ?? []).some(Boolean);
	}
	// instructions and calc collect nothing, so they can never be started.
	return false;
}

/**
 * Has this student entered anything into this module.
 *
 * What the module's own instructions panel collapses on: the reading has done
 * its job once the person is working, and it should not be sitting between
 * them and the table on every visit after that
 * (IDEA_INTERFACE_STANDARDS 1). It never removes anything -- see Disclosure.
 */
export function moduleStarted(
	mod: SpecModule,
	responses: Map<string, ResponseValue>,
	filesByBlock: Map<string, number>
): boolean {
	return mod.blocks.some((block) => blockStarted(block, responses, filesByBlock));
}

/** Has this student entered anything into this assignment, in any module. */
export function specStarted(
	spec: AssignmentSpec,
	responses: Map<string, ResponseValue>,
	filesByBlock: Map<string, number>
): boolean {
	return spec.modules.some((mod) => moduleStarted(mod, responses, filesByBlock));
}

/** Per-module completion for the module chip: constrained blocks met / total. */
export function moduleCompletion(
	mod: SpecModule,
	responses: Map<string, ResponseValue>,
	filesByBlock: Map<string, number>
): { done: number; total: number } {
	let done = 0;
	let total = 0;
	for (const block of mod.blocks) {
		const progress = blockProgress(block, responses, filesByBlock);
		if (!progress) continue;
		total += 1;
		if (progress.have >= progress.need) done += 1;
	}
	return { done, total };
}

/** A human sentence for one unmet entry, resolved against the spec. */
export function unmetLabel(spec: AssignmentSpec | null, entry: UnmetEntry): string {
	if (entry.kind === 'declaration') return 'Check the academic integrity declaration.';
	if (entry.kind === 'approval') {
		return spec?.approvalGate?.label
			? `${spec.approvalGate.label} -- ask your teacher to approve your work so far.`
			: 'Instructor approval is still needed before this can be submitted.';
	}
	const mod = spec?.modules.find((m) => m.id === entry.module_id);
	const block = mod?.blocks.find(
		(b) => 'id' in b && (b as InteractiveBlock).id === entry.block_id
	) as InteractiveBlock | undefined;
	const where = mod ? `${mod.title}: ` : '';
	if (entry.kind === 'textField') {
		const prompt = block?.type === 'textField' ? shorten(block.prompt) : entry.block_id;
		return `${where}"${prompt}" needs at least ${entry.need} sentence${entry.need === 1 ? '' : 's'} (${entry.have} so far).`;
	}
	if (entry.kind === 'table') {
		return `${where}the table needs at least ${entry.need} filled row${entry.need === 1 ? '' : 's'} (${entry.have} so far).`;
	}
	if (entry.kind === 'imageZone') {
		return `${where}attach at least ${entry.need} photo${entry.need === 1 ? '' : 's'} (${entry.have} so far).`;
	}
	if (entry.kind === 'checklist') {
		return `${where}check off all ${entry.need} checklist items (${entry.have} done).`;
	}
	return `${where}${entry.block_id ?? entry.kind} is incomplete.`;
}

function shorten(text: string): string {
	const t = text.trim();
	return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

// ---------------------------------------------------------------------------
// Rubrics
// ---------------------------------------------------------------------------

/**
 * The auto-generated rubric: the spec's module rubrics as ordered criteria,
 * LEVELS AND ALL (editable afterwards like any hand-built rubric).
 *
 * IDS ARE STABLE ACROSS REGENERATION, which is what keeps already-entered
 * scores aligned: an authored criterion id wins, positional `<module>-r<n>` is
 * the fallback, and `previous` (the rubric being replaced) pins the id already
 * in use for that same slot -- so re-generating after a spec gained authored ids
 * does not orphan the scores keyed under the old positional ones.
 */
export function rubricFromSpec(
	spec: AssignmentSpec,
	previous?: RubricCriterion[] | null
): RubricCriterion[] {
	const criteria: RubricCriterion[] = [];
	let slot = 0;
	for (const mod of spec.modules) {
		(mod.rubric ?? []).forEach((row, index) => {
			const authored = String(row.id ?? '').trim();
			const positional = `${mod.id}-r${index + 1}`;
			const existing = previous?.[slot]?.id;
			const generated = authored ? `${mod.id}-${authored}` : positional;
			// Keep the id already in play for this slot when it is one WE could
			// have generated before -- never when the author picked it by hand for
			// a different criterion.
			const id =
				existing && (existing === generated || existing === positional) ? existing : generated;
			const levels = (row.levels ?? []).map((l) => ({
				points: Number(l.points),
				label: l.label,
				descriptor: l.descriptor,
				// The authored short form, kept rather than dropped. This map was the
				// ONE place it was being lost: the specs carry it, the SQL normalizer
				// passes `levels` through verbatim, and the grading console has
				// nowhere else to read it from.
				...(l.short?.trim() ? { short: l.short } : {})
			}));
			criteria.push({
				id,
				criterion: `${mod.title}: ${row.criterion}`,
				points: criterionMax({ points: row.points, levels }),
				levels
			});
			slot += 1;
		});
	}
	return criteria;
}

/**
 * A LEVEL'S ONE-LINE FORM, resolved in one place for every caller.
 *
 * THREE SOURCES, in this order, and the order is the whole rule:
 *   1. the STORED level's own `short`, which is what a rubric saved since this
 *      existed carries;
 *   2. the matching SPEC level, paired by criterion id (rubricFromSpec's own id
 *      rule, so a rubric generated from this spec lines up) and then by points
 *      inside that criterion -- points are strictly descending, so at most one
 *      level can match, and matching on them rather than on position survives a
 *      criterion whose levels were reordered or trimmed in the builder;
 *   3. the full descriptor, which is what every level authored before this
 *      field existed has and is never wrong, only long.
 *
 * IT IS A READ, NOT A MIGRATION. Nothing here writes anything back: a spec's
 * short forms reach a stored rubric only when somebody regenerates it, and
 * until then this is what puts them on screen.
 */
export function levelShort(
	level: RubricLevel | null | undefined,
	criterionId: string,
	spec: AssignmentSpec | null | undefined
): string {
	if (!level) return '';
	const own = level.short?.trim();
	if (own) return own;
	if (spec) {
		const match = rubricFromSpec(spec)
			.find((c) => c.id === criterionId)
			?.levels?.find((l) => Number(l.points) === Number(level.points));
		const fromSpec = match?.short?.trim();
		if (fromSpec) return fromSpec;
	}
	return level.descriptor?.trim() ?? '';
}

export function rubricTotal(criteria: RubricCriterion[]): number {
	return criteria.reduce((sum, c) => sum + (criterionMax(c) || 0), 0);
}

export function scoresTotal(
	criteria: RubricCriterion[],
	scores: Record<string, number | null | undefined>
): number {
	return criteria.reduce((sum, c) => sum + (Number(scores[c.id]) || 0), 0);
}

// ---------------------------------------------------------------------------
// Submission display
// ---------------------------------------------------------------------------

export function submissionStateLabel(state: SubmissionState | null | undefined): string {
	switch (state) {
		case 'submitted':
			return 'Submitted';
		case 'returned':
			return 'Returned';
		default:
			return 'Not submitted';
	}
}

/** May the student edit right now? Locked only while awaiting grading. */
export function submissionEditable(state: SubmissionState | null | undefined): boolean {
	return state !== 'submitted';
}

// ---------------------------------------------------------------------------
// The FACTS export, and since 0097 the ONE export path for a grade in this
// app: the notebook's own CSV is gone, and a Documentation Check exports from
// here like any other assignment. One row per roster student, LAST-NAME
// alphabetical: Last, First, Score, Out of. RFC 4180 quoting, CRLF, UTF-8 BOM,
// and a formula-injection guard -- names are user-editable and this file gets
// opened in Excel.
// ---------------------------------------------------------------------------

export interface GradeCsvRow {
	displayName: string;
	email: string;
	/** Released score (state 'returned'); null renders blank for hand-entry. */
	score: number | null;
	outOf: number;
}

/** "Reyes, Eva" stays as authored; "Eva Reyes" splits on the last word. */
export function splitLastFirst(displayName: string, email: string): { last: string; first: string } {
	const name = displayName.trim() || email.split('@')[0];
	const comma = name.indexOf(',');
	if (comma > 0) {
		return { last: name.slice(0, comma).trim(), first: name.slice(comma + 1).trim() };
	}
	const words = name.split(/\s+/);
	if (words.length === 1) return { last: words[0], first: '' };
	return { last: words[words.length - 1], first: words.slice(0, -1).join(' ') };
}

function csvCell(value: string | number | null): string {
	if (value == null) return '';
	let text = String(value);
	// Formula-injection guard: Excel executes leading = + - @ (and trims
	// leading whitespace first), so prefix a quote.
	if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
	if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
	return text;
}

export function gradesCsv(rows: GradeCsvRow[]): string {
	const sorted = [...rows].sort((a, b) => {
		const an = splitLastFirst(a.displayName, a.email);
		const bn = splitLastFirst(b.displayName, b.email);
		return (
			an.last.localeCompare(bn.last, undefined, { sensitivity: 'base' }) ||
			an.first.localeCompare(bn.first, undefined, { sensitivity: 'base' })
		);
	});
	const lines = ['Last,First,Score,Out of'];
	for (const row of sorted) {
		const { last, first } = splitLastFirst(row.displayName, row.email);
		lines.push(
			[csvCell(last), csvCell(first), csvCell(row.score), csvCell(row.outOf)].join(',')
		);
	}
	// The BOM is BUILT AT RUNTIME (fromCharCode), never written as a
	// source literal or escape -- both proved unable to survive the
	// toolchain here. Excel needs it to open accented names correctly.
	return String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Row normalization + engine data bundles
// ---------------------------------------------------------------------------

export function normalizeSubmissionRow(row: Record<string, unknown>): SubmissionRow {
	return {
		id: String(row.id),
		item_id: String(row.item_id),
		student_email: String(row.student_email),
		state: (row.state as SubmissionState) ?? 'draft',
		submitted_at: (row.submitted_at as string | null) ?? null,
		returned_at: (row.returned_at as string | null) ?? null,
		rubric_scores: (row.rubric_scores as Record<string, number> | null) ?? null,
		criterion_comments: (row.criterion_comments as Record<string, string> | null) ?? null,
		score: row.score == null ? null : Number(row.score),
		teacher_comment: (row.teacher_comment as string | null) ?? null,
		graded_by: (row.graded_by as string | null) ?? null,
		graded_at: (row.graded_at as string | null) ?? null,
		updated_at: (row.updated_at as string | undefined) ?? undefined
	};
}

/** Everything the student half of the engine renders from. */
export interface StudentEngineData {
	spec: AssignmentSpec | null;
	rubric: RubricCriterion[] | null;
	submission: SubmissionRow | null;
	responses: ResponseRow[];
	files: SubmissionFileRow[];
	approvals: ModuleApprovalRow[];
}

/** One student's slice of the grading console's data. */
export interface StudentWork {
	email: string;
	displayName: string;
	active: boolean;
	submission: SubmissionRow | null;
	responses: ResponseRow[];
	files: SubmissionFileRow[];
	approvals: ModuleApprovalRow[];
}

export function responsesMap(rows: ResponseRow[]): Map<string, ResponseValue> {
	return new Map(rows.map((r) => [r.block_id, r.value ?? {}]));
}

export function filesByBlockCount(files: SubmissionFileRow[]): Map<string, number> {
	const map = new Map<string, number>();
	for (const f of files) {
		if (!f.block_id) continue;
		map.set(f.block_id, (map.get(f.block_id) ?? 0) + 1);
	}
	return map;
}

// ---------------------------------------------------------------------------
// Transports. Components stay presentation-only (the ReviewTransports
// convention): the real routes wire these to the 0086 RPCs + RLS-scoped
// selects, the dev harness answers in memory. Every transport resolves --
// never throws -- so refusals render inline.
// ---------------------------------------------------------------------------

import type { ClassroomEnrollment, TxResult } from './classroom';

/** The structured answer the 0086 RPCs give back (ok or a named refusal). */
export interface EngineOpResult {
	ok: boolean;
	reason?: string;
	module_id?: string;
	unmet?: UnmetEntry[];
	missing?: string[];
	submitted_at?: string;
	score?: number;
	state?: string;
}

export interface AssignmentEngineTransports {
	saveResponse(itemId: string, blockId: string, value: ResponseValue): Promise<TxResult<EngineOpResult>>;
	submitAssignment(itemId: string): Promise<TxResult<EngineOpResult>>;
	unsubmitAssignment(itemId: string): Promise<TxResult<EngineOpResult>>;
	uploadSubmissionFile(
		itemId: string,
		file: File,
		blockId?: string | null,
		caption?: string | null,
		onProgress?: (fraction: number) => void
	): Promise<TxResult<{ file?: SubmissionFileRow; reason?: string }>>;
	deleteSubmissionFile(fileId: string): Promise<TxResult<EngineOpResult>>;
	setFileCaption(fileId: string, caption: string): Promise<TxResult<EngineOpResult>>;
	/** Refetch the caller's own engine slice (after submit/unsubmit). */
	reloadStudent(itemId: string): Promise<TxResult<StudentEngineData>>;
}

export interface GradingData {
	roster: ClassroomEnrollment[];
	submissions: SubmissionRow[];
	responses: ResponseRow[];
	files: SubmissionFileRow[];
	approvals: ModuleApprovalRow[];
}

export interface AssignmentTeacherTransports {
	/** null removes the spec. The jsonb is validated server-side regardless. */
	setSpec(itemId: string, spec: unknown | null): Promise<TxResult<undefined>>;
	/** null removes the rubric. Full-set replacement. */
	setRubric(itemId: string, criteria: RubricCriterion[] | null): Promise<TxResult<undefined>>;
	gradeSubmission(
		itemId: string,
		studentEmail: string,
		scores: Record<string, number>,
		comment: string | null,
		release: boolean,
		/** Per-criterion comments. The server REQUIRES one for every override. */
		criterionComments?: CriterionComments | null
	): Promise<TxResult<EngineOpResult>>;
	approveModule(
		itemId: string,
		studentEmail: string,
		moduleId: string,
		approved: boolean
	): Promise<TxResult<undefined>>;
	loadGrading(itemId: string, sectionId: string): Promise<TxResult<GradingData>>;
}

/** GradingData reshaped into per-student slices, roster-ordered. */
export function studentWorkRows(data: GradingData): StudentWork[] {
	const byEmail = new Map<string, StudentWork>();
	const rows: StudentWork[] = [];
	const ensure = (email: string, name?: string, active = true): StudentWork => {
		let row = byEmail.get(email);
		if (!row) {
			row = {
				email,
				displayName: name || email.split('@')[0],
				active,
				submission: null,
				responses: [],
				files: [],
				approvals: []
			};
			byEmail.set(email, row);
			rows.push(row);
		}
		return row;
	};
	for (const e of [...data.roster].sort((a, b) =>
		a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })
	)) {
		ensure(e.student_email, e.display_name, e.active);
	}
	const submissionOwner = new Map<string, string>();
	for (const s of data.submissions) {
		submissionOwner.set(s.id, s.student_email);
		ensure(s.student_email).submission = s;
	}
	for (const r of data.responses) ensure(r.student_email).responses.push(r);
	for (const f of data.files) {
		const owner = submissionOwner.get(f.submission_id);
		if (owner) ensure(owner).files.push(f);
	}
	for (const a of data.approvals) ensure(a.student_email).approvals.push(a);
	return rows;
}

// ---------------------------------------------------------------------------
// The submission-file proxy URL: the ONE place it is built (the attachmentSrc
// convention), with the same dev-harness local-override map.
// ---------------------------------------------------------------------------

const localFileUrls = new Map<string, string>();

export function registerLocalSubmissionFileUrl(fileId: string, url: string): void {
	localFileUrls.set(fileId, url);
}

export function submissionFileSrc(fileId: string): string {
	return localFileUrls.get(fileId) ?? `/api/classroom/submission-file/${fileId}`;
}

/** The ONE image-type check for a submission file (SpecRenderer's imageZone
 *  blocks and SubmissionFileList's plain hand-ins both read this, so they can
 *  never disagree about what gets a thumbnail). */
export function isSubmissionFileImage(f: SubmissionFileRow): boolean {
	return (f.mime_type ?? '').toLowerCase().startsWith('image/');
}
