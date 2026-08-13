/**
 * The assignment engine's client-safe pure layer (the curriculum.ts
 * convention): spec types + validation, the preflight derivation, sentence
 * counting, rubric generation, grading math, and the FACTS CSV. No Svelte, no
 * Supabase.
 *
 * THE SPEC FORMAT is docs/IDEA_MATERIAL_SPEC_v1.md, one JSON document per
 * assignment. Validation here is the FRIENDLY half -- the import UI runs it so
 * a teacher sees every problem at once before anything is sent. The BOUNDARY is
 * _classroom_check_spec in migration 0086, which enforces the same rules inside
 * the SECURITY DEFINER RPC; this module and that function must agree, and the
 * suite pins the server side.
 *
 * THE SENTENCE RULE (countSentences) is mirrored by _classroom_sentence_count
 * in 0086: split on runs of . ! ? and count the pieces containing a letter or
 * digit. Change both together or the live counter will disagree with the
 * server's submit preflight.
 */

// ---------------------------------------------------------------------------
// Spec types (docs/IDEA_MATERIAL_SPEC_v1.md, schema v1)
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
	printAs?: string;
}

export interface ChecklistBlock {
	type: 'checklist';
	id: string;
	points?: number;
	items: string[];
}

export interface CalcBlock {
	type: 'calc';
	id: string;
	tool?: string;
	config?: unknown;
	printAs?: string;
	printConfig?: unknown;
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

export interface SpecRubricRow {
	criterion: string;
	points: number;
	descriptor?: string;
}

export interface SpecModule {
	id: string;
	title: string;
	points: number;
	aiLevel?: number | null;
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

export interface RubricLevel {
	label: string;
	points?: number;
	description?: string;
}

export interface RubricCriterion {
	id: string;
	criterion: string;
	points: number;
	levels?: RubricLevel[];
}

// ---------------------------------------------------------------------------
// Sentence counting (mirrors _classroom_sentence_count exactly)
// ---------------------------------------------------------------------------

export function countSentences(text: string | null | undefined): number {
	return (text ?? '').split(/[.!?]+/).filter((s) => /[A-Za-z0-9]/.test(s)).length;
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

import { specKind } from './reference-spec';

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function validateSpec(raw: unknown): { spec: AssignmentSpec | null; errors: string[] } {
	const errors: string[] = [];
	const fail = () => ({ spec: null, errors });

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

		const rubric = mod.rubric;
		const modPoints = typeof mod.points === 'number' ? mod.points : 0;
		if (Array.isArray(rubric) && rubric.length > 0) {
			let sum = 0;
			rubric.forEach((r, ri) => {
				const row = r as Record<string, unknown>;
				if (!String(row.criterion ?? '').trim() || typeof row.points !== 'number' || row.points < 0) {
					errors.push(`Module "${name}" rubric row ${ri + 1} needs a criterion and points >= 0.`);
				} else {
					sum += row.points;
				}
			});
			if (sum !== modPoints) {
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

	return errors.length ? fail() : { spec: raw as AssignmentSpec, errors: [] };
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
 * The auto-generated rubric: the spec's module rubrics flattened into ordered
 * criteria (editable afterwards like any hand-built rubric). Ids are stable
 * per (module, row) so re-generating after a spec tweak keeps existing scores
 * aligned where the rows survived.
 */
export function rubricFromSpec(spec: AssignmentSpec): RubricCriterion[] {
	const criteria: RubricCriterion[] = [];
	for (const mod of spec.modules) {
		(mod.rubric ?? []).forEach((row, index) => {
			criteria.push({
				id: `${mod.id}-r${index + 1}`,
				criterion: `${mod.title}: ${row.criterion}`,
				points: row.points,
				levels: row.descriptor ? [{ label: 'Full credit', description: row.descriptor }] : undefined
			});
		});
	}
	return criteria;
}

export function rubricTotal(criteria: RubricCriterion[]): number {
	return criteria.reduce((sum, c) => sum + (c.points || 0), 0);
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
// The FACTS export. One row per roster student, LAST-NAME alphabetical:
// Last, First, Score, Out of. RFC 4180 quoting, CRLF, UTF-8 BOM (the notebook
// review CSV's conventions), and the same formula-injection guard -- names are
// user-editable and this file gets opened in Excel.
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
		caption?: string | null
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
		release: boolean
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
