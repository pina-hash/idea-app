/**
 * THE TEXT SURFACES OF A SPEC -- the one enumeration of everything in an
 * assignment or a reference document that is WORDS A STUDENT READS, and
 * therefore the one definition of what the in-place editor may change.
 *
 * Pure data and pure functions (the classroom.ts / curriculum.ts convention):
 * no Svelte, no Supabase, no `$lib/server`. The editor renders from this list
 * and the guard (spec-text-guard.ts) refuses anything outside it, so there is
 * exactly ONE statement of "which fields are wording" and a bug in the editor
 * cannot widen it.
 *
 * THE ENUMERATION IS DERIVED FROM THE SCHEMA, not from a wish list. Every entry
 * below is a string field that some renderer puts in front of a student:
 * SpecRenderer for an assignment, ReferenceDoc + ReferenceBlock for a
 * reference document. Read alongside assignment-spec.ts and reference-spec.ts.
 *
 * WHAT IS DELIBERATELY NOT HERE, and why -- this list is the interesting half:
 *
 *  - `meta.totalPoints`, `module.points`, `block.points`, and every `rubric`
 *    field (criterion, level label, level descriptor, level short). These are
 *    the grading contract. The task this module exists for is a wording change;
 *    a points change belongs where the point sums are validated (SpecImporter
 *    and `_classroom_check_spec`).
 *  - `module.aiLevel` AND `module.aiNote`. The level is obviously out. The NOTE
 *    is out for the less obvious reason: it is the module's statement of what
 *    AI use is permitted for this work -- the level expressed in words -- and a
 *    level whose prose says something else is worse than either alone. It is one
 *    entry in `assignmentSurfaces` away if that judgement is ever reversed.
 *  - `section.slug`. A PERMANENT CONTRACT (reference-spec.ts's header): printed
 *    handouts and QR codes name it.
 *  - Every `url` (`cardGrid.cards[].url`, `linkCard.links[].url`) and every
 *    `id`/`key`/`type`. A URL is not prose; an id is structure.
 *  - `calc.config` in either spec. It carries points possible, category
 *    weights and the AI ladder's own levels; the prose inside it (a
 *    disclaimer, an entry's "permitted") is the text that EXPLAINS those
 *    numbers, and a text-only carve-out into a union-typed config object is
 *    the one place a guard bug would be least visible. `calc.title` is in.
 *  - `meta.headerFields` and `module.customChecks`. MEASURED, not assumed:
 *    both are declared in assignment-spec.ts and read by nothing in `src/` --
 *    no renderer anywhere puts either in front of a student. They are not
 *    text surfaces; they are dead fields.
 *
 * `kind` PER SURFACE IS A RENDERING FACT, also measured rather than assumed.
 * Exactly TWO fields in each spec go through MarkdownText -- an assignment's
 * `instructions.content`, and a reference document's `instructions.content`
 * and `callout.content`. Everything else is interpolated as plain text
 * (`<p>{mod.intro}</p>`, `<label>{block.prompt}</label>`, `<dt>{item.label}</dt>`),
 * so offering a rich-text control over one of those would let an author write
 * `**bold**` and read it back literally on the student's page.
 */

import type { AssignmentSpec, SpecBlock, SpecModule } from '$lib/classroom/assignment-spec';
import type { ReferenceBlock, ReferenceSpec, ReferenceSection } from '$lib/classroom/reference-spec';

/** One step of a path into the spec document. */
export type SpecPathSegment = string | number;
export type SpecTextPath = readonly SpecPathSegment[];

/**
 * How the field is EDITED, which follows from how it is RENDERED.
 *
 *  - `prose`  -- goes through MarkdownText. Rich text (see spec-markdown.ts).
 *  - `block`  -- plain text, but long enough to wrap. A textarea.
 *  - `line`   -- plain text, one line. An input.
 */
export type SpecTextKind = 'prose' | 'block' | 'line';

export interface SpecTextSurface {
	path: SpecTextPath;
	/** Stable identity for this surface, and the key the guard matches on. */
	key: string;
	kind: SpecTextKind;
	/** The field, in the author's words. "Intro", "Column heading". */
	label: string;
	/** Where in the document it sits. "Module 2 -- Measure the samples". */
	group: string;
	/** '' when the key is absent. */
	value: string;
	/** Is the key present in the document at all. */
	present: boolean;
	/** May the key be ADDED or REMOVED (an optional field in the schema). */
	optional: boolean;
	placeholder?: string;
}

/** The path, printed the way a violation names it: `modules[1].blocks[0].content`. */
export function specPathKey(path: SpecTextPath): string {
	let out = '';
	for (const seg of path) {
		if (typeof seg === 'number') out += `[${seg}]`;
		else out += out ? `.${seg}` : seg;
	}
	return out;
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

interface Collector {
	push(s: Omit<SpecTextSurface, 'key' | 'value' | 'present'> & { value?: unknown }): void;
}

function collector(out: SpecTextSurface[]): Collector {
	return {
		push(s) {
			out.push({
				...s,
				key: specPathKey(s.path),
				value: str(s.value),
				present: typeof s.value === 'string'
			});
		}
	};
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

function assignmentBlockSurfaces(
	c: Collector,
	block: SpecBlock,
	path: SpecTextPath,
	group: string,
	n: number
): void {
	const where = `${group} -- block ${n + 1}`;
	switch (block.type) {
		case 'instructions':
			c.push({
				path: [...path, 'content'],
				kind: 'prose',
				label: 'Instructions',
				group: where,
				value: block.content,
				optional: false,
				placeholder: 'What the student does, in order.'
			});
			return;
		case 'textField':
			c.push({
				path: [...path, 'prompt'],
				kind: 'block',
				label: 'Prompt',
				group: `${where} (${block.id})`,
				value: block.prompt,
				optional: false
			});
			return;
		case 'table':
			block.columns?.forEach((col, k) => {
				c.push({
					path: [...path, 'columns', k, 'label'],
					kind: 'line',
					label: `Column ${k + 1} heading`,
					group: `${where} (${block.id})`,
					value: col?.label,
					optional: false
				});
				c.push({
					path: [...path, 'columns', k, 'tip'],
					kind: 'line',
					label: `Column ${k + 1} tip`,
					group: `${where} (${block.id})`,
					value: col?.tip,
					optional: true,
					placeholder: 'Optional hover note'
				});
			});
			return;
		case 'checklist':
			block.items?.forEach((item, k) => {
				c.push({
					path: [...path, 'items', k],
					kind: 'line',
					label: `Item ${k + 1}`,
					group: `${where} (${block.id})`,
					value: item,
					optional: false
				});
			});
			return;
		// `imageZone` and `calc` carry no text at all: an image zone is an id, a
		// minimum and a captions flag, and a calc block is a tool name plus a
		// config this module deliberately does not enter.
		default:
			return;
	}
}

function assignmentModuleSurfaces(c: Collector, mod: SpecModule, i: number): void {
	const group = `Module ${i + 1} -- ${mod.title || '(untitled)'}`;
	c.push({
		path: ['modules', i, 'title'],
		kind: 'line',
		label: 'Module title',
		group,
		value: mod.title,
		optional: false
	});
	c.push({
		path: ['modules', i, 'intro'],
		kind: 'block',
		label: 'Intro',
		group,
		value: mod.intro,
		optional: true,
		placeholder: 'One or two sentences under the module heading.'
	});
	mod.blocks?.forEach((block, j) => {
		assignmentBlockSurfaces(c, block, ['modules', i, 'blocks', j], group, j);
	});
}

export function assignmentTextSurfaces(spec: AssignmentSpec): SpecTextSurface[] {
	const out: SpecTextSurface[] = [];
	const c = collector(out);
	c.push({
		path: ['meta', 'title'],
		kind: 'line',
		label: 'Assignment title',
		group: 'Header',
		value: spec?.meta?.title,
		optional: false
	});
	// Only when the gate exists. An absent gate has no label to write, and
	// creating one here would be adding a structural object.
	if (spec?.approvalGate && typeof spec.approvalGate === 'object') {
		c.push({
			path: ['approvalGate', 'label'],
			kind: 'line',
			label: 'Approval gate label',
			group: 'Header',
			value: spec.approvalGate.label,
			optional: true,
			placeholder: 'Instructor Approval Required'
		});
	}
	spec?.modules?.forEach((mod, i) => assignmentModuleSurfaces(c, mod, i));
	return out;
}

// ---------------------------------------------------------------------------
// Reference
// ---------------------------------------------------------------------------

function referenceBlockSurfaces(
	c: Collector,
	block: ReferenceBlock,
	path: SpecTextPath,
	group: string,
	n: number
): void {
	const where = `${group} -- block ${n + 1}`;
	const optionalTitle = (value: unknown) =>
		c.push({
			path: [...path, 'title'],
			kind: 'line',
			label: 'Block title',
			group: where,
			value,
			optional: true,
			placeholder: 'Optional heading'
		});

	switch (block.type) {
		case 'instructions':
			c.push({
				path: [...path, 'content'],
				kind: 'prose',
				label: 'Prose',
				group: where,
				value: block.content,
				optional: false
			});
			return;
		case 'keyValue':
			optionalTitle(block.title);
			block.items?.forEach((item, k) => {
				c.push({
					path: [...path, 'items', k, 'label'],
					kind: 'line',
					label: `Row ${k + 1} label`,
					group: where,
					value: item?.label,
					optional: false
				});
				c.push({
					path: [...path, 'items', k, 'value'],
					kind: 'line',
					label: `Row ${k + 1} value`,
					group: where,
					value: item?.value,
					optional: false
				});
			});
			return;
		case 'dataTable':
			optionalTitle(block.title);
			c.push({
				path: [...path, 'caption'],
				kind: 'line',
				label: 'Caption',
				group: where,
				value: block.caption,
				optional: true
			});
			block.columns?.forEach((col, k) => {
				c.push({
					path: [...path, 'columns', k, 'label'],
					kind: 'line',
					label: `Column ${k + 1} heading`,
					group: where,
					value: col?.label,
					optional: false
				});
			});
			// CELLS ARE KEYED BY THE COLUMN, never by the row object's own keys.
			// A row is a `Record<string, string>`, so walking the row would make
			// the editable set depend on data rather than on the document's
			// columns -- and a key no column names renders nowhere, which makes
			// it structure rather than text. A column the row has no entry for
			// is an OPTIONAL surface: writing it adds the key, exactly as the
			// renderer's `row[col.key] ?? ''` already expects.
			block.rows?.forEach((row, r) => {
				block.columns?.forEach((col, k) => {
					if (!col?.key) return;
					c.push({
						path: [...path, 'rows', r, col.key],
						kind: 'line',
						label: `Row ${r + 1}, ${col.label || col.key}`,
						group: where,
						value: row?.[col.key],
						optional: true
					});
				});
			});
			return;
		case 'callout':
			optionalTitle(block.title);
			c.push({
				path: [...path, 'content'],
				kind: 'prose',
				label: 'Callout body',
				group: where,
				value: block.content,
				optional: false
			});
			return;
		case 'cardGrid':
			optionalTitle(block.title);
			block.cards?.forEach((card, k) => {
				c.push({
					path: [...path, 'cards', k, 'title'],
					kind: 'line',
					label: `Card ${k + 1} title`,
					group: where,
					value: card?.title,
					optional: false
				});
				c.push({
					path: [...path, 'cards', k, 'body'],
					kind: 'block',
					label: `Card ${k + 1} body`,
					group: where,
					value: card?.body,
					optional: true
				});
			});
			return;
		case 'linkCard':
			optionalTitle(block.title);
			block.links?.forEach((link, k) => {
				c.push({
					path: [...path, 'links', k, 'fallbackLabel'],
					kind: 'line',
					label: `Link ${k + 1} fallback label`,
					group: where,
					value: link?.fallbackLabel,
					optional: false
				});
				c.push({
					path: [...path, 'links', k, 'label'],
					kind: 'line',
					label: `Link ${k + 1} label`,
					group: where,
					value: link?.label,
					optional: true
				});
				c.push({
					path: [...path, 'links', k, 'note'],
					kind: 'line',
					label: `Link ${k + 1} note`,
					group: where,
					value: link?.note,
					optional: true
				});
			});
			return;
		case 'calc':
			optionalTitle(block.title);
			return;
		default:
			return;
	}
}

function referenceSectionSurfaces(c: Collector, section: ReferenceSection, i: number): void {
	const group = `Section ${i + 1} -- ${section.title || '(untitled)'}`;
	c.push({
		path: ['sections', i, 'title'],
		kind: 'line',
		label: 'Section title',
		group,
		value: section.title,
		optional: false
	});
	c.push({
		path: ['sections', i, 'blurb'],
		kind: 'block',
		label: 'Blurb',
		group,
		value: section.blurb,
		optional: true,
		placeholder: 'One or two sentences under the section heading.'
	});
	section.blocks?.forEach((block, j) => {
		referenceBlockSurfaces(c, block, ['sections', i, 'blocks', j], group, j);
	});
}

export function referenceTextSurfaces(spec: ReferenceSpec): SpecTextSurface[] {
	const out: SpecTextSurface[] = [];
	const c = collector(out);
	c.push({
		path: ['meta', 'title'],
		kind: 'line',
		label: 'Document title',
		group: 'Header',
		value: spec?.meta?.title,
		optional: false
	});
	c.push({
		path: ['meta', 'subtitle'],
		kind: 'line',
		label: 'Subtitle',
		group: 'Header',
		value: spec?.meta?.subtitle,
		optional: true
	});
	spec?.sections?.forEach((section, i) => referenceSectionSurfaces(c, section, i));
	return out;
}

export type EditableSpec = AssignmentSpec | ReferenceSpec;
export type EditableSpecKind = 'assignment' | 'reference';

/** The one entry point. Everything else in this file is its two halves. */
export function specTextSurfaces(
	spec: EditableSpec | null | undefined,
	kind: EditableSpecKind
): SpecTextSurface[] {
	if (!spec || typeof spec !== 'object') return [];
	return kind === 'reference'
		? referenceTextSurfaces(spec as ReferenceSpec)
		: assignmentTextSurfaces(spec as AssignmentSpec);
}

// ---------------------------------------------------------------------------
// Reading and writing one surface
// ---------------------------------------------------------------------------

/**
 * A JSON round trip, deliberately, rather than `structuredClone`. What matters
 * for the write below is that every untouched branch comes out VALUE identical,
 * which the guard then re-checks; a JSON clone states exactly that and drops
 * anything non-JSON on the way, which a jsonb column could not have stored.
 */
function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}

export function readSpecText(spec: EditableSpec, path: SpecTextPath): string | undefined {
	let node: unknown = spec;
	for (const seg of path) {
		if (node == null || typeof node !== 'object') return undefined;
		node = (node as Record<SpecPathSegment, unknown>)[seg as never];
	}
	return typeof node === 'string' ? node : undefined;
}

/**
 * Write ONE text surface, immutably. `undefined` removes the key, which is how
 * an optional field is cleared -- writing `''` into `column.tip` would leave a
 * tip that renders as an empty hover note rather than no tip at all.
 *
 * IT DOES NOT VALIDATE. Whether the result is a legal edit is the guard's
 * question, asked afterwards on the document this produced. That separation is
 * what stops the writer becoming a second, softer copy of the rules.
 */
export function writeSpecText<T extends EditableSpec>(
	spec: T,
	path: SpecTextPath,
	value: string | undefined
): T {
	if (!path.length) return spec;
	const next = clone(spec) as unknown as Record<SpecPathSegment, unknown>;
	let node: Record<SpecPathSegment, unknown> = next;
	for (let i = 0; i < path.length - 1; i++) {
		const seg = path[i];
		const child = node[seg as never];
		if (child == null || typeof child !== 'object') return spec;
		node = child as Record<SpecPathSegment, unknown>;
	}
	const last = path[path.length - 1];
	if (value === undefined) delete node[last as never];
	else node[last as never] = value;
	return next as unknown as T;
}

/**
 * Apply a whole edit set, keyed by `specPathKey`. The surfaces are re-read from
 * the ORIGINAL document so an edit can never move another edit's path: every
 * path in the set was computed against the same structure, and nothing here
 * changes a structure.
 */
export function applySpecTextEdits<T extends EditableSpec>(
	spec: T,
	kind: EditableSpecKind,
	edits: Map<string, string>
): T {
	let out = spec;
	for (const surface of specTextSurfaces(spec, kind)) {
		if (!edits.has(surface.key)) continue;
		const raw = edits.get(surface.key) as string;
		// NOTHING AT ALL HAPPENS WHEN THE VALUE HAS NOT MOVED, and this line is
		// what makes the no-op round trip byte-identical. It is checked BEFORE
		// the empty-means-remove rule below, which is a corpus finding: two
		// reference documents carry a dataTable cell stored as `""`, and
		// removing the key because the value "is empty" rewrote a document
		// nobody had edited.
		if (raw === surface.value && surface.present) continue;
		// An optional field emptied is REMOVED; a required one keeps its empty
		// string, because deleting it would be a structural change and the guard
		// would (correctly) refuse the save.
		const next = surface.optional && raw.trim() === '' ? undefined : raw;
		if (next === undefined && !surface.present) continue;
		out = writeSpecText(out, surface.path, next);
	}
	return out;
}
