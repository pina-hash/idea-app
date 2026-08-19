/**
 * REFERENCE SPECS: the second `kind` of spec document (schema v2's `kind`
 * discriminator), and the client-safe pure layer for it -- types, validation,
 * the two calc tools' arithmetic, and the tiny inline-markup parser the
 * renderer walks. No Svelte, no Supabase (the curriculum.ts / assignment-spec.ts
 * convention).
 *
 * WHAT A REFERENCE IS, AND WHAT IT DELIBERATELY IS NOT. A reference document is
 * a structured thing a student READS -- a syllabus, a policy sheet, a parts
 * list. It carries `sections[]` instead of `modules[]`, and it has no points,
 * no rubric, no AI level on the document itself, no declaration, no preflight,
 * no submission, and no student state beyond the last-viewed stamp the item
 * already had. Every one of those is assignment vocabulary, and a reference
 * spec carrying one is REJECTED rather than ignored: a silently dropped field
 * in a document a parent reads is worse than a failed import.
 *
 * THE `kind` DISCRIMINATOR IS BACKWARD COMPATIBLE BY CONSTRUCTION. A v1 spec
 * with no `kind` field IS an assignment -- `specKind()` is the one place that
 * default lives, and both the TypeScript validator and _classroom_check_spec
 * (0092) apply it identically. So every existing assignment spec validates and
 * renders exactly as it did before schema v2 existed.
 *
 * SLUGS ARE A PERMANENT CONTRACT. Each section carries an authored slug, unique
 * within the document and URL-safe, because /209h#ai-policy is what an
 * assignment links to instead of restating policy. Changing a slug breaks every
 * printed sheet and every deep link that ever pointed at it; validation treats
 * a malformed or duplicated one as a hard error for exactly that reason.
 *
 * THE BOUNDARY IS SQL, AS ALWAYS. _classroom_check_spec in migration 0092
 * enforces the same rules inside the SECURITY DEFINER RPC, because that RPC is
 * callable straight through PostgREST. This module is the FRIENDLY half: the
 * import UI runs it so a teacher sees every problem at once. The two must
 * agree; the suite pins the SQL side.
 */

// ---------------------------------------------------------------------------
// The kind discriminator
// ---------------------------------------------------------------------------

export type SpecKind = 'assignment' | 'reference';

/**
 * Which kind of document this is. THE DEFAULT IS THE COMPATIBILITY RULE: a
 * schema v1 file has no `kind` field at all and is an assignment. Mirrored by
 * _classroom_check_spec; change both together.
 */
export function specKind(raw: unknown): SpecKind | null {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
	const kind = (raw as Record<string, unknown>).kind;
	if (kind == null || kind === '') return 'assignment';
	if (kind === 'assignment' || kind === 'reference') return kind;
	return null;
}

// ---------------------------------------------------------------------------
// Reference spec types
// ---------------------------------------------------------------------------

export interface ReferenceMeta {
	referenceId: string;
	title: string;
	subtitle?: string;
	course?: string;
	buildVersion?: string;
	updated?: string;
}

/** Free prose. Shared with the assignment spec's block of the same name. */
export interface RefInstructionsBlock {
	type: 'instructions';
	content: string;
}

/** A compact facts strip: aligned label/value rows, never a heavy table. */
export interface KeyValueBlock {
	type: 'keyValue';
	title?: string;
	items: { label: string; value: string }[];
}

/**
 * A STATIC display table. Deliberately a different block from the assignment
 * engine's `table`, which exists for student data entry: this one never gains a
 * row and never accepts input, so nothing about it is a response.
 */
export interface DataTableBlock {
	type: 'dataTable';
	title?: string;
	caption?: string;
	columns: { key: string; label: string }[];
	rows: Record<string, string>[];
}

export type CalloutVariant = 'info' | 'warn' | 'required';

export interface CalloutBlock {
	type: 'callout';
	variant: CalloutVariant;
	title?: string;
	content: string;
}

export interface CardGridBlock {
	type: 'cardGrid';
	title?: string;
	cards: { title: string; url?: string; body?: string }[];
}

/**
 * One or more links as preview cards. `fallbackLabel` is ALWAYS displayed
 * alongside the link whether or not metadata fetched -- the syllabus links to
 * specific purchasable parts, and when a retailer listing dies the part number
 * still has to be readable on the page. That is why it is required.
 */
export interface LinkCardBlock {
	type: 'linkCard';
	title?: string;
	links: { url: string; fallbackLabel: string; label?: string; note?: string }[];
}

export interface GradeCalcCategory {
	name: string;
	pointsPossible: number;
	weight: number;
}

export interface GradeCalculatorConfig {
	categories: GradeCalcCategory[];
	disclaimer: string;
}

export interface AiLevelEntry {
	workType: string;
	/** 0-3, the IDEA_AI_Use_Policy ladder. Named `level`, never `aiLevel`: a
	 *  reference spec may not carry an aiLevel field anywhere. */
	level: number;
	permitted: string;
	notPermitted: string;
	example?: string;
}

export interface AiLevelLookupConfig {
	entries: AiLevelEntry[];
}

export interface RefCalcBlock {
	type: 'calc';
	tool: CalcToolName;
	config: GradeCalculatorConfig | AiLevelLookupConfig;
	title?: string;
}

export type ReferenceBlock =
	| RefInstructionsBlock
	| KeyValueBlock
	| DataTableBlock
	| CalloutBlock
	| CardGridBlock
	| LinkCardBlock
	| RefCalcBlock;

export interface ReferenceSection {
	/** URL-safe, unique in the document, and a PERMANENT contract (see header). */
	slug: string;
	title: string;
	blurb?: string;
	blocks: ReferenceBlock[];
}

export type ReferenceNavigation = 'tabs' | 'stacked';

export interface ReferenceSpec {
	schemaVersion: 2;
	kind: 'reference';
	meta: ReferenceMeta;
	navigation?: ReferenceNavigation;
	sections: ReferenceSection[];
}

export const CALC_TOOLS = ['gradeCalculator', 'aiLevelLookup'] as const;
export type CalcToolName = (typeof CALC_TOOLS)[number];

export const REFERENCE_BLOCK_TYPES = [
	'instructions',
	'keyValue',
	'dataTable',
	'callout',
	'cardGrid',
	'linkCard',
	'calc'
] as const;

/**
 * Keys that may not appear ANYWHERE in a reference document. Rejected rather
 * than ignored (see the header). `aiLevel` is on the list, which is why the AI
 * lookup's own field is called `level`.
 */
export const FORBIDDEN_REFERENCE_KEYS = [
	'points',
	'totalPoints',
	'rubric',
	'aiLevel',
	'declarations',
	'approvalGate',
	'modules'
] as const;

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CALLOUT_VARIANTS: CalloutVariant[] = ['info', 'warn', 'required'];

/** Best-effort slug suggestion for the authoring UI. Never used to REPAIR a
 *  bad authored slug -- a slug is a contract, so a wrong one is an error. */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

// ---------------------------------------------------------------------------
// Validation (the friendly half; _classroom_check_spec in 0092 is the boundary)
// ---------------------------------------------------------------------------

const KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;
const URL_RE = /^https?:\/\//i;

/** Every key present anywhere under a value, recursively. */
function collectKeys(value: unknown, into: Set<string>, depth = 0): void {
	if (depth > 12 || value == null) return;
	if (Array.isArray(value)) {
		for (const v of value) collectKeys(v, into, depth + 1);
		return;
	}
	if (typeof value !== 'object') return;
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		into.add(k);
		collectKeys(v, into, depth + 1);
	}
}

export function validateReferenceSpec(raw: unknown): {
	spec: ReferenceSpec | null;
	errors: string[];
} {
	const errors: string[] = [];
	const fail = () => ({ spec: null, errors });

	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		errors.push('The spec must be a JSON object.');
		return fail();
	}
	const spec = raw as Record<string, unknown>;
	if (spec.kind !== 'reference') {
		errors.push('A reference spec must set kind to "reference".');
		return fail();
	}
	if (spec.schemaVersion !== 2) {
		errors.push('A reference spec needs schemaVersion 2.');
	}

	// The reject-don't-ignore rule, applied to the WHOLE document at once.
	const keys = new Set<string>();
	collectKeys(spec, keys);
	for (const banned of FORBIDDEN_REFERENCE_KEYS) {
		if (keys.has(banned)) {
			errors.push(
				`A reference document may not carry "${banned}" anywhere -- references have no points, rubric, AI level, or declarations.`
			);
		}
	}

	const meta = spec.meta as Record<string, unknown> | undefined;
	if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
		errors.push('The spec needs a meta object.');
		return fail();
	}
	if (!String(meta.referenceId ?? '').trim()) errors.push('meta.referenceId is required.');
	if (!String(meta.title ?? '').trim()) errors.push('meta.title is required.');

	const nav = spec.navigation;
	if (nav != null && nav !== 'tabs' && nav !== 'stacked') {
		errors.push('navigation must be "tabs" or "stacked" (default "tabs").');
	}

	const sections = spec.sections;
	if (!Array.isArray(sections) || sections.length === 0) {
		errors.push('The spec needs a non-empty sections array.');
		return fail();
	}
	if (sections.length > 40) errors.push('At most 40 sections per reference document.');

	const slugs = new Set<string>();
	sections.forEach((s, si) => {
		const section = s as Record<string, unknown>;
		const label = `Section ${si + 1}`;
		const slug = String(section.slug ?? '');
		if (!slug) {
			errors.push(`${label} needs a slug (it is the deep-link target, e.g. "ai-policy").`);
		} else if (!SLUG_RE.test(slug) || slug.length > 60) {
			errors.push(
				`${label} slug "${slug}" is not URL-safe -- use lowercase letters, digits and single hyphens.`
			);
		} else if (slugs.has(slug)) {
			errors.push(`Duplicate section slug "${slug}".`);
		} else {
			slugs.add(slug);
		}
		const name = slug || label;
		if (!String(section.title ?? '').trim()) errors.push(`Section "${name}" needs a title.`);

		const blocks = section.blocks;
		if (!Array.isArray(blocks) || blocks.length === 0) {
			errors.push(`Section "${name}" needs a non-empty blocks array.`);
			return;
		}
		if (blocks.length > 60) errors.push(`Section "${name}" has more than 60 blocks.`);

		blocks.forEach((b, bi) => {
			validateReferenceBlock(b, `Section "${name}" block ${bi + 1}`, errors);
		});
	});

	return errors.length ? fail() : { spec: raw as ReferenceSpec, errors: [] };
}

function validateReferenceBlock(raw: unknown, label: string, errors: string[]): void {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		errors.push(`${label} is not an object.`);
		return;
	}
	const block = raw as Record<string, unknown>;
	const type = String(block.type ?? '');
	if (!(REFERENCE_BLOCK_TYPES as readonly string[]).includes(type)) {
		errors.push(
			`${label} has unknown type "${type || '(none)'}". A reference document reads; it never collects work, so the assignment engine's input blocks are not available here.`
		);
		return;
	}

	if (type === 'instructions') {
		if (!String(block.content ?? '').trim()) errors.push(`${label} (instructions) has no content.`);
		return;
	}

	if (type === 'keyValue') {
		const items = block.items;
		if (!Array.isArray(items) || items.length === 0 || items.length > 40) {
			errors.push(`${label} (keyValue) needs 1-40 items.`);
			return;
		}
		items.forEach((it, i) => {
			const row = it as Record<string, unknown>;
			if (typeof row !== 'object' || row === null || !String(row.label ?? '').trim()) {
				errors.push(`${label} (keyValue) row ${i + 1} needs a label.`);
			}
			if (row && typeof row === 'object' && typeof row.value !== 'string') {
				errors.push(`${label} (keyValue) row ${i + 1} needs a text value.`);
			}
		});
		return;
	}

	if (type === 'dataTable') {
		const columns = block.columns;
		if (!Array.isArray(columns) || columns.length === 0 || columns.length > 10) {
			errors.push(`${label} (dataTable) needs 1-10 columns.`);
			return;
		}
		const keys = new Set<string>();
		columns.forEach((c, i) => {
			const col = c as Record<string, unknown>;
			const key = String(col?.key ?? '');
			if (!KEY_RE.test(key) || !String(col?.label ?? '').trim()) {
				errors.push(`${label} (dataTable) column ${i + 1} needs a key and a label.`);
			} else if (keys.has(key)) {
				errors.push(`${label} (dataTable) has a duplicate column key "${key}".`);
			} else {
				keys.add(key);
			}
		});
		const rows = block.rows;
		if (!Array.isArray(rows) || rows.length === 0 || rows.length > 200) {
			errors.push(`${label} (dataTable) needs 1-200 rows.`);
			return;
		}
		rows.forEach((r, i) => {
			if (typeof r !== 'object' || r === null || Array.isArray(r)) {
				errors.push(`${label} (dataTable) row ${i + 1} must be an object keyed by column.`);
			}
		});
		return;
	}

	if (type === 'callout') {
		const variant = String(block.variant ?? '');
		if (!CALLOUT_VARIANTS.includes(variant as CalloutVariant)) {
			errors.push(`${label} (callout) variant must be info, warn or required.`);
		}
		if (!String(block.content ?? '').trim()) errors.push(`${label} (callout) has no content.`);
		return;
	}

	if (type === 'cardGrid') {
		const cards = block.cards;
		if (!Array.isArray(cards) || cards.length < 2 || cards.length > 4) {
			errors.push(`${label} (cardGrid) needs 2-4 cards.`);
			return;
		}
		cards.forEach((c, i) => {
			const card = c as Record<string, unknown>;
			if (typeof card !== 'object' || card === null || !String(card.title ?? '').trim()) {
				errors.push(`${label} (cardGrid) card ${i + 1} needs a title.`);
			}
			const url = card?.url;
			if (url != null && url !== '' && !URL_RE.test(String(url))) {
				errors.push(`${label} (cardGrid) card ${i + 1} url must start with http:// or https://.`);
			}
		});
		return;
	}

	if (type === 'linkCard') {
		const links = block.links;
		if (!Array.isArray(links) || links.length === 0 || links.length > 30) {
			errors.push(`${label} (linkCard) needs 1-30 links.`);
			return;
		}
		links.forEach((l, i) => {
			const link = l as Record<string, unknown>;
			if (typeof link !== 'object' || link === null || !URL_RE.test(String(link.url ?? ''))) {
				errors.push(`${label} (linkCard) link ${i + 1} needs a http(s) url.`);
				return;
			}
			// The whole point of the field: a dead retailer listing must still
			// leave the part number readable on the page.
			if (!String(link.fallbackLabel ?? '').trim()) {
				errors.push(
					`${label} (linkCard) link ${i + 1} needs a fallbackLabel -- it stays on the page when the target dies.`
				);
			}
		});
		return;
	}

	// calc
	const tool = String(block.tool ?? '');
	if (!(CALC_TOOLS as readonly string[]).includes(tool)) {
		errors.push(
			`${label} (calc) has unknown tool "${tool || '(none)'}". Known tools: ${CALC_TOOLS.join(', ')}.`
		);
		return;
	}
	const config = block.config as Record<string, unknown> | undefined;
	if (typeof config !== 'object' || config === null || Array.isArray(config)) {
		errors.push(`${label} (calc) needs a config object.`);
		return;
	}
	if (tool === 'gradeCalculator') {
		const categories = config.categories;
		if (!Array.isArray(categories) || categories.length === 0 || categories.length > 20) {
			errors.push(`${label} (gradeCalculator) needs 1-20 categories.`);
		} else {
			categories.forEach((c, i) => {
				const cat = c as Record<string, unknown>;
				if (typeof cat !== 'object' || cat === null || !String(cat.name ?? '').trim()) {
					errors.push(`${label} (gradeCalculator) category ${i + 1} needs a name.`);
					return;
				}
				// NOTE the field names: pointsPossible, never `points` -- `points`
				// is on the forbidden list, and this really is not points on the
				// document, it is a number the student types against.
				if (typeof cat.pointsPossible !== 'number' || cat.pointsPossible <= 0) {
					errors.push(
						`${label} (gradeCalculator) category ${i + 1} needs pointsPossible > 0.`
					);
				}
				if (typeof cat.weight !== 'number' || cat.weight <= 0) {
					errors.push(`${label} (gradeCalculator) category ${i + 1} needs weight > 0.`);
				}
			});
		}
		if (!String(config.disclaimer ?? '').trim()) {
			errors.push(
				`${label} (gradeCalculator) needs a disclaimer -- it is an estimate the student runs in their own browser, and the page has to say so.`
			);
		}
		return;
	}
	// aiLevelLookup
	const entries = config.entries;
	if (!Array.isArray(entries) || entries.length === 0 || entries.length > 40) {
		errors.push(`${label} (aiLevelLookup) needs 1-40 entries.`);
		return;
	}
	entries.forEach((e, i) => {
		const entry = e as Record<string, unknown>;
		if (typeof entry !== 'object' || entry === null) {
			errors.push(`${label} (aiLevelLookup) entry ${i + 1} is not an object.`);
			return;
		}
		if (!String(entry.workType ?? '').trim()) {
			errors.push(`${label} (aiLevelLookup) entry ${i + 1} needs a workType.`);
		}
		if (typeof entry.level !== 'number' || ![0, 1, 2, 3].includes(entry.level)) {
			errors.push(`${label} (aiLevelLookup) entry ${i + 1} needs level 0-3.`);
		}
		if (!String(entry.permitted ?? '').trim() || !String(entry.notPermitted ?? '').trim()) {
			errors.push(
				`${label} (aiLevelLookup) entry ${i + 1} needs both permitted and notPermitted text.`
			);
		}
	});
}

// ---------------------------------------------------------------------------
// Grade calculator arithmetic. Entirely client-side: nothing here is saved,
// transmitted, or written anywhere, which is exactly what the authored
// disclaimer says.
// ---------------------------------------------------------------------------

export interface GradeCalcRow {
	name: string;
	pointsPossible: number;
	weight: number;
	/** null when the student has not entered anything for this category. */
	earned: number | null;
	/** earned / pointsPossible, as a percentage. Null when nothing entered. */
	percent: number | null;
	/** This category's share of the overall figure, in percentage points. */
	contribution: number | null;
	counted: boolean;
}

export interface GradeCalcResult {
	rows: GradeCalcRow[];
	/** The overall percentage, or null when nothing counts yet. */
	overall: number | null;
	countedWeight: number;
	totalWeight: number;
}

/**
 * @param entered raw text per category index, exactly as typed (so a blank and
 *        a zero stay distinguishable -- a zero is a real score).
 * @param completedOnly compute against ONLY the categories with a value
 *        entered, rather than every category's full points possible.
 */
export function gradeCalcResult(
	config: GradeCalculatorConfig,
	entered: (string | number | null | undefined)[],
	completedOnly: boolean
): GradeCalcResult {
	const totalWeight = config.categories.reduce((sum, c) => sum + (c.weight || 0), 0);

	// Pass 1: parse, and decide which categories count at all. Not entered? In
	// completed-only mode the category is simply absent; in full mode it counts
	// as zero earned against its full weight, which is what "against all points
	// possible" means.
	const parsed = config.categories.map((cat, i) => {
		const rawValue = entered[i];
		const text = rawValue == null ? '' : String(rawValue).trim();
		const num = text === '' ? null : Number(text);
		const earned = num == null || Number.isNaN(num) ? null : num;
		return { cat, earned, counted: completedOnly ? earned != null : true };
	});

	// Pass 2: contributions are shares of the FINAL percentage, so they can only
	// be computed once the counted weight is known -- weights are relative, and
	// nothing here may assume they add up to 100 (a spec is free to use 0.4).
	const countedWeight = parsed.reduce((sum, p) => sum + (p.counted ? p.cat.weight || 0 : 0), 0);
	const rows: GradeCalcRow[] = parsed.map(({ cat, earned, counted }) => {
		const fraction = earned == null || !cat.pointsPossible ? null : earned / cat.pointsPossible;
		return {
			name: cat.name,
			pointsPossible: cat.pointsPossible,
			weight: cat.weight,
			earned,
			percent: fraction == null ? null : fraction * 100,
			contribution:
				!counted || countedWeight <= 0
					? null
					: ((fraction ?? 0) * (cat.weight || 0) * 100) / countedWeight,
			counted
		};
	});
	const overall =
		countedWeight > 0 ? rows.reduce((sum, r) => sum + (r.contribution ?? 0), 0) : null;
	return { rows, overall, countedWeight, totalWeight };
}

export function formatPercent(value: number | null, digits = 1): string {
	if (value == null || !Number.isFinite(value)) return '--';
	return `${value.toFixed(digits)}%`;
}

// ---------------------------------------------------------------------------
// Inline markup. DELIBERATELY NOT HTML AND DELIBERATELY NOT {@html}: this parses
// into typed runs the renderer walks into real Svelte elements, which escape
// their text by construction, so there is no sanitizer standing between an
// authored document and a reader's browser (the notebook note-content doctrine).
// ---------------------------------------------------------------------------

export interface InlineRun {
	text: string;
	bold?: boolean;
	italic?: boolean;
	/** `code`, rendered as a <code> element -- never as markup. */
	code?: boolean;
	/** http/https/mailto only; anything else keeps its TEXT and loses the link. */
	href?: string;
}

export interface MarkdownList {
	ordered: boolean;
	items: MarkdownListItem[];
}

export interface MarkdownListItem {
	runs: InlineRun[];
	/**
	 * ONE level of nesting, deliberately. A deeper indent folds into this same
	 * level rather than growing an arbitrary tree: a reference document is a
	 * syllabus, not an outline editor, and an unbounded depth is a rendering
	 * and a legibility problem with no author asking for it.
	 */
	child?: MarkdownList | null;
}

/**
 * The block vocabulary the renderer walks.
 *
 * A HEADING IS ONLY EVER LEVEL 3 OR 4. h1 is the document title and h2 is the
 * section title, both owned by ReferenceDoc, so an authored `#` can never
 * outrank them: 1-3 hashes clamp to 3 and 4-6 clamp to 4. Clamping rather than
 * refusing is what guarantees no literal hash marks ever leak into body copy,
 * which is the bug this replaced. Authored headings are also never given an
 * id -- SECTION SLUGS ARE THE ONLY ANCHOR CONTRACT (see the header).
 *
 * A `table` node is a GFM-style pipe table: a header row of cells, each
 * already run through `parseInline`, and zero or more body rows shaped to
 * match the header's own column count (a short row is padded with an empty
 * cell, a long one is truncated) -- so the renderer never has to guard a
 * ragged row itself.
 */
export type MarkdownNode =
	| { type: 'heading'; level: 3 | 4; runs: InlineRun[] }
	| { type: 'paragraph'; runs: InlineRun[] }
	| ({ type: 'list' } & MarkdownList)
	| { type: 'quote'; paragraphs: InlineRun[][] }
	| { type: 'code'; text: string; lang?: string }
	| { type: 'table'; headers: InlineRun[][]; rows: InlineRun[][][] };

const SAFE_HREF_RE = /^(https?:|mailto:)/i;

export function safeHref(url: string): string | undefined {
	const trimmed = url.trim();
	return SAFE_HREF_RE.test(trimmed) ? trimmed : undefined;
}

/**
 * `` `code` ``, `**bold**`, `*italic*`, `[label](url)`. Anything else is
 * literal text -- including anything that looks like HTML, which the renderer
 * puts through Svelte's own escaping and therefore cannot become an element,
 * an attribute, or a handler.
 *
 * Code is FIRST in the alternation so a backticked span wins over emphasis
 * inside it; the whole span becomes one literal run.
 */
export function parseInline(text: string): InlineRun[] {
	const runs: InlineRun[] = [];
	const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
	let last = 0;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		if (match.index > last) runs.push({ text: text.slice(last, match.index) });
		if (match[1] != null) runs.push({ text: match[1], code: true });
		else if (match[2] != null) runs.push({ text: match[2], bold: true });
		else if (match[3] != null) runs.push({ text: match[3], italic: true });
		else runs.push({ text: match[4], href: safeHref(match[5]) });
		last = match.index + match[0].length;
	}
	if (last < text.length) runs.push({ text: text.slice(last) });
	return runs.length ? runs : [{ text }];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/;
const ITEM_RE = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const TABLE_DELIM_CELL_RE = /^:?-{1,}:?$/;

/** A tab counts as four columns when deciding whether an item is nested, or
 *  whether a line qualifies as an indented code block. */
function indentWidth(prefix: string): number {
	return prefix.replace(/\t/g, '    ').length;
}

/**
 * Splits a pipe-delimited table row into trimmed cell strings. Strips one
 * leading and one trailing `|` when present -- the usual `| a | b |` shape --
 * but a bare `a | b` with no edge pipes is accepted too.
 */
function splitTableRow(line: string): string[] {
	let t = line.trim();
	if (t.startsWith('|')) t = t.slice(1);
	if (t.endsWith('|')) t = t.slice(0, -1);
	return t.split('|').map((c) => c.trim());
}

/** A GFM delimiter row: every cell is only `-`, with optional `:` alignment
 *  markers at either end. This is what tells a real table from an ordinary
 *  line that happens to contain a pipe. */
function isTableDelimiterRow(cells: string[]): boolean {
	return cells.length > 0 && cells.every((c) => TABLE_DELIM_CELL_RE.test(c));
}

/**
 * Block-level markdown: headings, paragraphs, ordered and unordered lists with
 * one level of nesting, blockquotes, pipe tables, and code blocks -- both
 * fenced (` ``` `) and indented (4 spaces or a tab) -- plus the inline set
 * above.
 *
 * IT PRODUCES TYPED NODES, NOT HTML, AND THAT IS THE SECURITY MODEL. There is
 * no sanitizer here to get wrong: MarkdownText walks these into real Svelte
 * elements, which escape their own text by construction, and the only href
 * that survives is one safeHref accepted. So raw HTML, a javascript: url and an
 * onerror attribute in authored content are all inert by the same mechanism --
 * they are never markup in the first place (the notebook note-content
 * doctrine). Anything unrecognised stays literal text; an author who wants to
 * SHOW markup uses a code fence.
 */
export function parseMarkdown(body: string): MarkdownNode[] {
	const nodes: MarkdownNode[] = [];
	const lines = (body ?? '').replace(/\r\n/g, '\n').split('\n');

	let paragraph: string[] = [];
	let list: MarkdownList | null = null;
	let quote: string[] | null = null;
	let fence: { marker: string; lang: string; lines: string[] } | null = null;
	let codeIndent: string[] | null = null;

	const flushParagraph = () => {
		if (!paragraph.length) return;
		nodes.push({ type: 'paragraph', runs: parseInline(paragraph.join(' ')) });
		paragraph = [];
	};
	const flushList = () => {
		if (!list) return;
		nodes.push({ type: 'list', ordered: list.ordered, items: list.items });
		list = null;
	};
	const flushQuote = () => {
		if (!quote) return;
		const paragraphs: InlineRun[][] = [];
		let buffer: string[] = [];
		for (const line of quote) {
			if (line.trim()) buffer.push(line.trim());
			else if (buffer.length) {
				paragraphs.push(parseInline(buffer.join(' ')));
				buffer = [];
			}
		}
		if (buffer.length) paragraphs.push(parseInline(buffer.join(' ')));
		if (paragraphs.length) nodes.push({ type: 'quote', paragraphs });
		quote = null;
	};
	const flushFence = () => {
		if (!fence) return;
		nodes.push({
			type: 'code',
			text: fence.lines.join('\n'),
			...(fence.lang ? { lang: fence.lang } : {})
		});
		fence = null;
	};
	/** Trailing blank lines are not part of the block (CommonMark's rule for
	 *  indented code); an empty accumulator (blank lines with nothing after
	 *  them, which cannot actually happen given how it is opened) emits nothing. */
	const flushCodeIndent = () => {
		if (!codeIndent) return;
		while (codeIndent.length && codeIndent[codeIndent.length - 1] === '') codeIndent.pop();
		if (codeIndent.length) nodes.push({ type: 'code', text: codeIndent.join('\n') });
		codeIndent = null;
	};
	const flushAll = () => {
		flushParagraph();
		flushList();
		flushQuote();
	};

	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];
		const fenced = FENCE_RE.exec(line);

		// Inside a fence NOTHING is markup: only a closing fence of the same
		// character ends it, and an unterminated fence still emits at EOF.
		if (fence) {
			if (fenced && fenced[1][0] === fence.marker) flushFence();
			else fence.lines.push(line);
			continue;
		}
		if (fenced) {
			flushAll();
			flushCodeIndent();
			fence = { marker: fenced[1][0], lang: fenced[2] ?? '', lines: [] };
			continue;
		}

		// An indented code block: 4+ columns of leading whitespace (a tab counts
		// as 4). It can only START right after a blank line -- never interrupting
		// an open paragraph, list or quote, which is what lets an indented list
		// continuation or a deeply wrapped sentence keep working exactly as
		// before -- and it swallows blank lines until a non-indented one closes
		// it, which is why the check for STARTING one comes after the blank-line
		// handling below rather than here.
		const expanded = line.replace(/\t/g, '    ');
		const indentCols = expanded.length - expanded.trimStart().length;
		const blank = !line.trim();

		if (codeIndent) {
			if (blank) {
				codeIndent.push('');
				continue;
			}
			if (indentCols >= 4) {
				codeIndent.push(expanded.slice(4));
				continue;
			}
			// Falls through: this line ends the code block and is handled below
			// exactly like any other line.
			flushCodeIndent();
		}

		const trimmed = line.trim();
		if (!trimmed) {
			// A blank line ends a paragraph but NOT a list: a loose list (items
			// separated by blank lines) is still one list, and splitting it into
			// several would put a gap and a fresh marker sequence mid-list.
			flushParagraph();
			if (quote) quote.push('');
			continue;
		}

		if (indentCols >= 4 && !paragraph.length && !list && !quote) {
			flushAll();
			codeIndent = [expanded.slice(4)];
			continue;
		}

		const heading = HEADING_RE.exec(trimmed);
		if (heading) {
			flushAll();
			nodes.push({
				type: 'heading',
				level: heading[1].length <= 3 ? 3 : 4,
				runs: parseInline(heading[2].trim())
			});
			continue;
		}

		// A pipe table: a header row containing at least one '|' immediately
		// followed by a delimiter row of only '-'/':'/'|' and whitespace. The
		// look-ahead at the delimiter row is what tells a real table from an
		// ordinary line that happens to contain a pipe.
		if (trimmed.includes('|')) {
			const headerCells = splitTableRow(trimmed);
			const nextLine = li + 1 < lines.length ? lines[li + 1].trim() : '';
			if (headerCells.length > 1 && nextLine.includes('|')) {
				const delimCells = splitTableRow(nextLine);
				if (delimCells.length === headerCells.length && isTableDelimiterRow(delimCells)) {
					flushAll();
					const bodyRows: string[][] = [];
					let j = li + 2;
					while (j < lines.length) {
						const rowTrimmed = lines[j].trim();
						if (!rowTrimmed || !rowTrimmed.includes('|')) break;
						bodyRows.push(splitTableRow(rowTrimmed));
						j++;
					}
					nodes.push({
						type: 'table',
						headers: headerCells.map((c) => parseInline(c)),
						// Every row is shaped to the header's own column count, so the
						// renderer never has to guard a short or ragged row itself.
						rows: bodyRows.map((r) => headerCells.map((_, ci) => parseInline(r[ci] ?? '')))
					});
					li = j - 1;
					continue;
				}
			}
		}

		const quoted = QUOTE_RE.exec(trimmed);
		if (quoted) {
			flushParagraph();
			flushList();
			(quote ??= []).push(quoted[1]);
			continue;
		}
		flushQuote();

		const item = ITEM_RE.exec(line);
		if (item) {
			flushParagraph();
			const ordered = item[2] == null;
			const runs = parseInline(item[4].trim());
			const nested = indentWidth(item[1]) >= 2;
			const parent = list?.items[list.items.length - 1];
			if (nested && parent) {
				if (!parent.child || parent.child.ordered !== ordered) {
					parent.child = { ordered, items: [] };
				}
				parent.child.items.push({ runs });
			} else {
				if (!list || list.ordered !== ordered) {
					flushList();
					list = { ordered, items: [] };
				}
				list.items.push({ runs });
			}
			continue;
		}

		flushList();
		paragraph.push(trimmed);
	}

	flushCodeIndent();
	flushFence();
	flushAll();
	return nodes;
}

// ---------------------------------------------------------------------------
// Public read payload (what classroom_public_reference hands back, and nothing
// else -- see 0092's header for why this shape is the security boundary).
// ---------------------------------------------------------------------------

export interface PublicReferenceAttachment {
	id: string;
	filename: string;
	mime_type: string;
	size_bytes?: number | null;
	sort_order?: number;
}

export interface PublicReferencePayload {
	item_id: string;
	title: string;
	spec: ReferenceSpec;
	attachments: PublicReferenceAttachment[];
	updated_at?: string | null;
}

/** What classroom_set_item_public hands back, so the confirm step can name
 *  what actually becomes visible rather than guessing. */
export interface PublicToggleResult {
	ok: boolean;
	item_id?: string;
	is_public?: boolean;
	has_reference?: boolean;
	attachments?: number;
}

/**
 * The teacher-side transports for reference documents. Presentation components
 * take these injected (the ReviewTransports convention), so the dev harness
 * drives the identical components with no backend.
 */
export interface ReferenceTransports {
	/** null REMOVES the document. Validated server-side regardless. */
	setReferenceSpec(
		itemId: string,
		spec: unknown | null
	): Promise<{ ok: boolean; message?: string; data?: undefined }>;
	setPublic(
		itemId: string,
		isPublic: boolean
	): Promise<{ ok: boolean; message?: string; data?: PublicToggleResult }>;
}

/** Deep-link target for one section of a published reference document. */
export function referenceHref(itemId: string, slug?: string | null): string {
	return slug ? `/reference/${itemId}#${slug}` : `/reference/${itemId}`;
}

/** The slug in a location hash, or null. Tolerates a leading '#'. */
export function slugFromHash(hash: string | null | undefined): string | null {
	const raw = (hash ?? '').replace(/^#/, '').trim();
	return raw && SLUG_RE.test(raw) ? raw : null;
}
